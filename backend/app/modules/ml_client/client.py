"""Клиент ML-сервиса: POST {ML_URL}/predict с фото, таймаут ML_TIMEOUT_SECONDS.

Формат ответа — предложение бэкенда (В-34), его отдаёт заглушка ml_service/stub.
Если модель не ответила вовремя или ответила ошибкой, возвращается None: гражданин
выбирает класс сам (REQ-022), заявка не теряется.
"""

import logging
from typing import Literal

import httpx2
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.config import get_settings

log = logging.getLogger(__name__)


class Prediction(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    has_pit: bool
    defect_class: Literal["big", "small"] | None = Field(None, alias="class")
    pits_count: int = Field(0, ge=0)
    confidence: float | None = None
    model_version: str | None = None


def predict(
    data: bytes, filename: str, mime_type: str, client: httpx2.Client | None = None
) -> Prediction | None:
    settings = get_settings()
    http = client or httpx2.Client(timeout=settings.ml_timeout_seconds)
    try:
        response = http.post(
            f"{settings.ml_url.rstrip('/')}/predict",
            files={"image": (filename, data, mime_type)},
        )
        response.raise_for_status()
        prediction = Prediction.model_validate(response.json())
    except (httpx2.HTTPError, ValueError, ValidationError) as error:
        log.warning("ML-сервис недоступен: %s", type(error).__name__)
        return None
    finally:
        if client is None:
            http.close()
    if prediction.has_pit and prediction.defect_class is None:
        return None  # яма без класса — ответ неполный, класс выберет гражданин
    return prediction
