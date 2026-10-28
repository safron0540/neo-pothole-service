"""
FastAPI-микросервис для инференса YOLO-классификатора дорожного покрытия.
uvicorn inference.main:app --port 8001
"""

import hashlib
from contextlib import asynccontextmanager
from typing import Literal

import numpy as np
import torch
from fastapi import FastAPI, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel, ConfigDict, Field
from ultralytics import YOLO

MODEL_PATH = "runs_yolo/YOLO26_s/weights/best.pt"
MODEL_VERSION = "yolo26_s_1.0"
IMGSZ = 512
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
# будет всегда cpu, т.к. для облегчения установки зависимостей выбран torch без cuda
model = None


# Загрузка модели при старте
@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    model = YOLO(MODEL_PATH)
    yield


app = FastAPI(title="ML Service (stub)", version=MODEL_VERSION, lifespan=lifespan)


class Prediction(BaseModel):
    # В JSON поле называется class, в Python это слово занято
    model_config = ConfigDict(populate_by_name=True)

    has_pit: bool
    defect_class: Literal["big", "small"] | None = Field(alias="class")
    pits_count: int = Field(ge=0)
    confidence: float = Field(ge=0, le=1)
    model_version: str


def _predict(img: bytes) -> Prediction:
    """Возвращает название класса: 'no' | 'small' | 'big'."""
    img = np.array(img)

    if img.dtype != np.uint8:
        img = img.astype(np.uint8)

    pil_img = Image.fromarray(img, mode="RGB")
    results = model.predict(source=pil_img, imgsz=IMGSZ, device=DEVICE, verbose=False)
    top1_idx = int(results[0].probs.top1)
    label = results[0].names[top1_idx]
    confidence = float(results[0].probs.data[top1_idx])

    return Prediction(
        has_pit=False if label == "no" else True,
        defect_class=None if label == "no" else label,
        pits_count=0 if label == "no" else 1,
        confidence=confidence,
        model_version=MODEL_VERSION,
    )


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
    return _predict(data)
