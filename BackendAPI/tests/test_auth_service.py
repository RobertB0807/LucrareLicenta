from __future__ import annotations

import unittest

import jwt

from auth_service import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)


class AuthServiceTestCase(unittest.TestCase):
    def test_password_hash_and_verify(self) -> None:
        password = "very-strong-password"
        password_hash = hash_password(password)

        self.assertTrue(password_hash.startswith("scrypt$"))
        self.assertTrue(verify_password(password, password_hash))
        self.assertFalse(verify_password("wrong-password", password_hash))

    def test_access_token_roundtrip(self) -> None:
        token = create_access_token(user_id="user-123", email="user@example.com")
        payload = decode_access_token(token)

        self.assertEqual(payload["sub"], "user-123")
        self.assertEqual(payload["email"], "user@example.com")
        self.assertEqual(payload["type"], "access")
        self.assertIn("jti", payload)
        self.assertIn("exp", payload)

    def test_refresh_token_roundtrip_and_token_types_are_not_interchangeable(self) -> None:
        access_token = create_access_token(user_id="user-123", email="user@example.com")
        refresh_token = create_refresh_token(user_id="user-123", email="user@example.com")

        payload = decode_refresh_token(refresh_token)
        self.assertEqual(payload["sub"], "user-123")
        self.assertEqual(payload["email"], "user@example.com")
        self.assertEqual(payload["type"], "refresh")
        self.assertIn("jti", payload)

        with self.assertRaises(jwt.InvalidTokenError):
            decode_access_token(refresh_token)
        with self.assertRaises(jwt.InvalidTokenError):
            decode_refresh_token(access_token)


if __name__ == "__main__":
    unittest.main()
