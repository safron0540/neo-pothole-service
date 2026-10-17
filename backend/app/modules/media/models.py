"""Фото «до» и «после». Файл лежит на диске (PHOTOS_DIR), в БД — путь и размеры."""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Photo(Base):
    __tablename__ = "photos"
    __table_args__ = (
        CheckConstraint("mime_type IN ('image/jpeg', 'image/png')", name="mime_type"),
        # ФТ-2: не меньше 1280×720 в любой ориентации, вертикальное 720×1280 тоже проходит
        CheckConstraint(
            "greatest(width, height) >= 1280 AND least(width, height) >= 720", name="resolution"
        ),
        Index("ix_photos_created_at", "created_at"),
    )

    # Генерирует API: номер входит в имя файла, поэтому его нельзя подобрать
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    uploader_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="RESTRICT")
    )
    path: Mapped[str] = mapped_column(String(500))
    mime_type: Mapped[str] = mapped_column(String(20))  # по содержимому файла (Pillow)
    size_bytes: Mapped[int] = mapped_column(Integer)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    ml_json: Mapped[dict | None] = mapped_column(JSONB)
    model_version: Mapped[str | None] = mapped_column(String(50))
    # По ней ночная задача удаляет фото без заявки старше 24 часов
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
