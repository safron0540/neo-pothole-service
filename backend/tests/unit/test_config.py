import pytest
from pydantic import ValidationError

from app.config import DEV_JWT_SECRET, Settings


def test_defaults_match_architecture(monkeypatch):
    for name in ("JWT_ACCESS_MINUTES", "JWT_REFRESH_DAYS", "ML_TIMEOUT_SECONDS", "ENVIRONMENT"):
        monkeypatch.delenv(name, raising=False)

    settings = Settings(_env_file=None)

    assert settings.jwt_access_minutes == 30
    assert settings.jwt_refresh_days == 14
    assert settings.ml_timeout_seconds == 8


def test_values_are_read_from_environment(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@db:5432/x")
    monkeypatch.setenv("JWT_ACCESS_MINUTES", "15")

    settings = Settings(_env_file=None)

    assert settings.database_url == "postgresql+psycopg://u:p@db:5432/x"
    assert settings.jwt_access_minutes == 15


def test_prod_requires_real_jwt_secret(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "prod")
    monkeypatch.setenv("JWT_SECRET", DEV_JWT_SECRET)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)
