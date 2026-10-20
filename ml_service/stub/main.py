"""Заглушка ML-сервиса: uvicorn stub.main:app --port 8001

Отвечает так же, как будет отвечать настоящая модель, чтобы бэкенд и клиенты
работали до её готовности. Формат ответа — предложение бэкенда (В-34), его нужно
согласовать с ML-разработчиком. Поведение задаёт ML_STUB_MODE:

- random (по умолчанию): ответ зависит от содержимого фото, одно фото — один ответ;
- big, small, no_pit: всегда этот результат;
- unavailable: 503, как будто модель упала (бэкенд даёт гражданину выбрать класс);
- slow: ждёт ML_STUB_DELAY секунд (по умолчанию 10), чтобы проверить таймаут 8 с.
"""

import asyncio
import hashlib
import os
from typing import Literal

from fastapi import FastAPI, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field

MODEL_VERSION = "stub-0.1"

app = FastAPI(title="ML Service (stub)", version=MODEL_VERSION)


class Prediction(BaseModel):
    # В JSON поле называется class, в Python это слово занято
    model_config = ConfigDict(populate_by_name=True)

    has_pit: bool
    defect_class: Literal["big", "small"] | None = Field(alias="class")
    pits_count: int = Field(ge=0)
    confidence: float = Field(ge=0, le=1)
    model_version: str


def predict_bytes(data: bytes, mode: str) -> Prediction:
    digest = hashlib.sha256(data).digest()
    if mode == "random":
        mode = ("no_pit", "small", "big", "big")[digest[0] % 4]
    if mode == "no_pit":
        return Prediction(
            has_pit=False,
            defect_class=None,
            pits_count=0,
            confidence=0.9,
            model_version=MODEL_VERSION,
        )
    return Prediction(
        has_pit=True,
        defect_class="small" if mode == "small" else "big",
        pits_count=1 + digest[1] % 3,
        confidence=round(0.6 + digest[2] / 255 * 0.39, 2),
        model_version=MODEL_VERSION,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model_version": MODEL_VERSION}


@app.post("/predict", response_model=Prediction)
async def predict(image: UploadFile) -> Prediction:
    data = await image.read()
    if not data:
        raise HTTPException(status_code=422, detail="Пустой файл")
    mode = os.environ.get("ML_STUB_MODE", "random")
    if mode == "unavailable":
        raise HTTPException(status_code=503, detail="Модель недоступна")
    if mode == "slow":
        await asyncio.sleep(float(os.environ.get("ML_STUB_DELAY", "10")))
        mode = "big"
    return predict_bytes(data, mode)
