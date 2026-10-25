"""Анализ фото до создания заявки (REQ-016, 018, 019, 022, 034)."""

import uuid

from pydantic import BaseModel, Field

from app.schemas import DefectClass


class PhotoAnalysis(BaseModel):
    """Ответ POST /photos/analyze. Если ямы нет — 422 с кодом no_pit_detected."""

    photo_id: uuid.UUID = Field(description="передаётся в POST /requests")
    model_unavailable: bool = Field(
        description="модель не ответила за 8 с: класс выбирает гражданин"
    )
    defect_class: DefectClass | None = Field(None, description="пусто, если модель недоступна")
    pits_count: int | None = Field(None, ge=1)
    model_version: str | None = None
