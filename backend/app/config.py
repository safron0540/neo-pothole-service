"""Настройки приложения.

Значения берутся из переменных окружения или файла .env (имена без учёта регистра:
DATABASE_URL, JWT_SECRET и т. д.). Значения по умолчанию подходят только для разработки.
"""

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_SECRET = "dev-only-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Pothole Service API"
    environment: str = "dev"  # dev | test | prod

    database_url: str = "postgresql+psycopg://app:app@127.0.0.1:5432/potholes"

    jwt_secret: str = DEV_JWT_SECRET
    jwt_access_minutes: int = 30
    jwt_refresh_days: int = 14

    photos_dir: str = "/data/photos"

    ml_url: str = "http://127.0.0.1:8001"
    ml_timeout_seconds: float = 8.0

    @model_validator(mode="after")
    def _secret_is_set_in_prod(self) -> "Settings":
        # На сервере нельзя случайно запуститься с секретом из примера
        if self.environment == "prod" and self.jwt_secret == DEV_JWT_SECRET:
            raise ValueError("JWT_SECRET должен быть задан для environment=prod")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
