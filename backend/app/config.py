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
    # Версия текста согласий на ПДн и геолокацию, которую принимает гражданин (БЗ-4)
    consent_version: str = "1.0"

    photos_dir: str = "/data/photos"
    photo_max_bytes: int = 10 * 1024 * 1024  # В-21: больше — 413
    photo_url_minutes: int = 15  # срок подписанной ссылки на фото

    ml_url: str = "http://127.0.0.1:8001"
    ml_timeout_seconds: float = 8.0

    # Радиусы поиска при автообработке, метры (REQ-039, 044; В-13 [D])
    street_match_radius_m: float = 30
    building_match_radius_m: float = 30
    duplicate_radius_m: float = 15

    # Адреса веба через запятую: только им браузер разрешит запросы к API (БЗ-1)
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @model_validator(mode="after")
    def _secret_is_set_in_prod(self) -> "Settings":
        # На сервере нельзя случайно запуститься с секретом из примера
        if self.environment == "prod" and self.jwt_secret == DEV_JWT_SECRET:
            raise ValueError("JWT_SECRET должен быть задан для environment=prod")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
