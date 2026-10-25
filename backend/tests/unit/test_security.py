"""Пароли и токены без базы: argon2, JWT, хэш refresh, зависимость «роль»."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.security import HTTPAuthorizationCredentials

from app.deps import CurrentUser, current_user, require
from app.errors import ApiError
from app.modules.auth import security


def bearer(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def test_bz_2_password_hash_is_argon2_and_verifies():
    password_hash = security.hash_password("Secret123")
    assert password_hash.startswith("$argon2")
    assert "Secret123" not in password_hash
    assert security.verify_password(password_hash, "Secret123")
    assert not security.verify_password(password_hash, "secret123")
    assert not security.verify_password("not-a-hash", "Secret123")


def test_access_token_roundtrip():
    token = security.create_access_token(7, "contractor", 3, datetime.now(UTC))
    payload = security.decode_access_token(token)
    assert payload["sub"] == "7" and payload["role"] == "contractor" and payload["cid"] == 3


def test_access_token_lives_30_minutes():
    issued = datetime.now(UTC) - timedelta(minutes=31)
    token = security.create_access_token(1, "citizen", None, issued)
    assert security.decode_access_token(token) is None


def test_access_token_with_wrong_signature_rejected():
    token = security.create_access_token(1, "citizen", None, datetime.now(UTC))
    assert security.decode_access_token(token[:-2] + "xx") is None


def test_refresh_stored_as_sha256():
    token = security.new_refresh_token()
    digest = security.hash_refresh_token(token)
    assert len(digest) == 64 and token not in digest
    assert security.new_refresh_token() != token


def test_current_user_requires_token():
    with pytest.raises(ApiError) as error:
        current_user(None)
    assert error.value.status == 401


def test_current_user_from_token():
    token = security.create_access_token(5, "dispatcher", None, datetime.now(UTC))
    assert current_user(bearer(token)) == CurrentUser(id=5, role="dispatcher")


def test_role_dependency_forbids_other_roles():
    check = require("dispatcher")
    assert check(CurrentUser(1, "dispatcher")).id == 1
    with pytest.raises(ApiError) as error:
        check(CurrentUser(2, "citizen"))
    assert error.value.status == 403
