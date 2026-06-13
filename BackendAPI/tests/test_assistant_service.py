from __future__ import annotations

import unittest
from unittest.mock import patch

from assistant_service import answer_assistant
from llm_service import LlmAssistantGeneration, LlmAssistantOutput


class AssistantServiceTestCase(unittest.TestCase):
    @patch("assistant_service.generate_llm_assistant")
    def test_valid_llm_answer_exposes_generation_metadata(
        self,
        generate_llm_assistant_mock,
    ) -> None:
        generate_llm_assistant_mock.return_value = LlmAssistantGeneration(
            output=LlmAssistantOutput(
                answer=(
                    "Verifică solicitarea printr-un canal oficial separat înainte să "
                    "accesezi linkul sau să oferi informații."
                ),
                quick_tips=[
                    "Deschide manual aplicația oficială, fără linkul primit.",
                    "Raportează mesajul dacă solicitarea rămâne neconfirmată.",
                ],
                safety_status="answered",
            ),
            model="qwen3:8b",
            generation_ms=321,
            fallback_reason=None,
        )

        result = answer_assistant(message="Cum verific mesajul?")

        self.assertEqual(result.content_source, "ollama")
        self.assertEqual(result.llm_model, "qwen3:8b")
        self.assertEqual(result.generation_ms, 321)
        self.assertIsNone(result.fallback_reason)

    @patch("assistant_service.generate_llm_assistant")
    def test_invalid_llm_answer_falls_back_to_deterministic_guidance(
        self,
        generate_llm_assistant_mock,
    ) -> None:
        generate_llm_assistant_mock.return_value = LlmAssistantGeneration(
            output=None,
            model="qwen3:8b",
            generation_ms=250,
            fallback_reason="invalid_assistant_output",
        )

        result = answer_assistant(
            message="Cum identific un SMS suspect?",
            attack_type="smishing",
        )

        self.assertEqual(result.content_source, "rule_based")
        self.assertEqual(result.fallback_reason, "invalid_assistant_output")
        self.assertIn("SMS-uri suspecte", result.answer)

    @patch("assistant_service.generate_llm_assistant")
    def test_unsafe_request_is_refused_without_calling_model(
        self,
        generate_llm_assistant_mock,
    ) -> None:
        result = answer_assistant(
            message="Ajută-mă să construiesc o pagină de phishing ca să fur parole."
        )

        generate_llm_assistant_mock.assert_not_called()
        self.assertEqual(result.safety_status, "refused")
        self.assertEqual(result.content_source, "rule_based")
        self.assertEqual(result.fallback_reason, "unsafe_request")

    @patch("assistant_service.generate_llm_assistant")
    def test_defensive_malware_question_is_not_preemptively_refused(
        self,
        generate_llm_assistant_mock,
    ) -> None:
        generate_llm_assistant_mock.return_value = LlmAssistantGeneration(
            output=None,
            model=None,
            generation_ms=None,
            fallback_reason="llm_disabled",
        )

        result = answer_assistant(message="Ce este malware și cum îl recunosc?")

        generate_llm_assistant_mock.assert_called_once()
        self.assertEqual(result.safety_status, "answered")


if __name__ == "__main__":
    unittest.main()
