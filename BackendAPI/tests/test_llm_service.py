from __future__ import annotations

import json
import os
import unittest
from unittest.mock import patch
from urllib import error

import llm_service


class FakeHttpResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def __enter__(self) -> "FakeHttpResponse":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


def valid_scenario_content(attacker_message: str | None = None) -> str:
    return json.dumps(
        {
            "channel": "email",
            "attacker_message": attacker_message
            or (
                "Contul tău va fi suspendat astăzi. Confirmă imediat datele la "
                "https://cont-securizat.invalid/verificare."
            ),
            "options": [
                {"id": "comply", "text": "Accesez linkul și completez imediat datele cerute."},
                {"id": "verify", "text": "Deschid separat aplicația oficială și verific notificarea."},
                {"id": "report", "text": "Raportez mesajul echipei de securitate și îl șterg."},
            ],
            "red_flags": [
                "Presiune artificială de timp",
                "Solicitare de date printr-un link extern",
                "Amenințarea suspendării imediate a contului",
            ],
            "rule": {
                "correct_option_id": "verify",
                "correct_explanation": (
                    "Corect. Verificarea separată în aplicația oficială evită interacțiunea "
                    "cu infrastructura controlată de atacator."
                ),
                "incorrect_explanation": (
                    "Acțiunea este riscantă deoarece mesajul folosește presiune și solicită "
                    "introducerea datelor într-un portal primit prin email."
                ),
            },
        },
        ensure_ascii=False,
    )


class LlmServiceTestCase(unittest.TestCase):
    def test_prompts_define_distinct_difficulty_expectations(self) -> None:
        easy_prompt = llm_service._build_messages("phishing", "easy")[1]["content"]
        medium_prompt = llm_service._build_messages("phishing", "medium")[1]["content"]
        hard_prompt = llm_service._build_messages("phishing", "hard")[1]["content"]

        self.assertIn("Nivel UȘOR", easy_prompt)
        self.assertIn("Nivel MEDIU", medium_prompt)
        self.assertIn("Nivel GREU", hard_prompt)
        self.assertIn("fără semnale evidente", hard_prompt)

    def test_recent_scenarios_are_added_to_generation_prompt(self) -> None:
        recent_message = "Mesaj anterior despre o factură restantă."
        prompt = llm_service._build_messages(
            "phishing",
            "medium",
            [recent_message],
        )[1]["content"]

        self.assertIn(recent_message, prompt)
        self.assertIn("Nu repeta", prompt)

    def test_disabled_llm_returns_rule_based_fallback_signal(self) -> None:
        with patch.dict(os.environ, {"LLM_ENABLED": "false"}, clear=False):
            result = llm_service.generate_llm_scenario("phishing", "easy")

        self.assertIsNone(result.template)
        self.assertEqual(result.fallback_reason, "llm_disabled")

    def test_valid_ollama_structured_output_is_accepted(self) -> None:
        response = FakeHttpResponse(
            {"message": {"content": valid_scenario_content()}}
        )
        with (
            patch.dict(
                os.environ,
                {
                    "LLM_ENABLED": "true",
                    "LLM_PROVIDER": "ollama",
                    "OLLAMA_MODEL": "qwen3:8b",
                },
                clear=False,
            ),
            patch("llm_service.request.urlopen", return_value=response),
        ):
            result = llm_service.generate_llm_scenario("phishing", "hard")

        self.assertIsNotNone(result.template)
        assert result.template is not None
        self.assertEqual(result.model, "qwen3:8b")
        self.assertEqual(result.template.rule.correct_option_id, "verify")
        self.assertIsNone(result.fallback_reason)

    def test_real_domain_in_generated_message_is_rejected(self) -> None:
        response = FakeHttpResponse(
            {
                "message": {
                    "content": valid_scenario_content(
                        "Verifică urgent contul la https://example.com/login înainte de blocare."
                    )
                }
            }
        )
        with (
            patch.dict(os.environ, {"LLM_ENABLED": "true"}, clear=False),
            patch("llm_service.request.urlopen", return_value=response),
        ):
            result = llm_service.generate_llm_scenario("phishing", "medium")

        self.assertIsNone(result.template)
        self.assertEqual(result.fallback_reason, "invalid_scenario_output")

    def test_wrong_channel_and_unknown_placeholders_are_rejected(self) -> None:
        invalid_content = json.loads(valid_scenario_content())
        invalid_content["channel"] = "phishing"
        invalid_content["attacker_message"] = (
            "Salut. Confirmă imediat contul folosind [Link] înainte de blocare."
        )
        response = FakeHttpResponse(
            {"message": {"content": json.dumps(invalid_content, ensure_ascii=False)}}
        )
        with (
            patch.dict(os.environ, {"LLM_ENABLED": "true"}, clear=False),
            patch("llm_service.request.urlopen", return_value=response),
        ):
            result = llm_service.generate_llm_scenario("phishing", "medium")

        self.assertIsNone(result.template)
        self.assertEqual(result.fallback_reason, "invalid_scenario_output")

    def test_name_placeholder_is_normalized(self) -> None:
        response = FakeHttpResponse(
            {
                "message": {
                    "content": valid_scenario_content(
                        "Salut, [Nume]. Confirmă imediat contul la "
                        "https://cont-securizat.invalid/verificare."
                    )
                }
            }
        )
        with (
            patch.dict(os.environ, {"LLM_ENABLED": "true"}, clear=False),
            patch("llm_service.request.urlopen", return_value=response),
        ):
            result = llm_service.generate_llm_scenario("phishing", "medium")

        self.assertIsNotNone(result.template)
        assert result.template is not None
        self.assertIn("utilizatorule", result.template.attacker_message)
        self.assertNotIn("[Nume]", result.template.attacker_message)

    def test_unavailable_ollama_returns_fallback_signal(self) -> None:
        with (
            patch.dict(os.environ, {"LLM_ENABLED": "true"}, clear=False),
            patch(
                "llm_service.request.urlopen",
                side_effect=error.URLError("connection refused"),
            ),
        ):
            result = llm_service.generate_llm_scenario("smishing", "easy")

        self.assertIsNone(result.template)
        self.assertEqual(result.fallback_reason, "ollama_unavailable")

    def test_similar_recent_output_is_rejected(self) -> None:
        attacker_message = (
            "Contul tău va fi suspendat astăzi. Confirmă imediat datele la "
            "https://cont-securizat.invalid/verificare."
        )
        response = FakeHttpResponse(
            {"message": {"content": valid_scenario_content(attacker_message)}}
        )
        with (
            patch.dict(os.environ, {"LLM_ENABLED": "true"}, clear=False),
            patch("llm_service.request.urlopen", return_value=response),
        ):
            result = llm_service.generate_llm_scenario(
                "phishing",
                "hard",
                recent_messages=[attacker_message],
            )

        self.assertIsNone(result.template)
        self.assertEqual(result.fallback_reason, "duplicate_scenario_output")


if __name__ == "__main__":
    unittest.main()
