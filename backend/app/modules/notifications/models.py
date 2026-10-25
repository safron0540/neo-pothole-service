"""Уведомления. Пока только device_tokens (этап 2, FCM); notifications появится в 0004."""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class DeviceToken(Base):
    """FCM-токен телефона. Таблица заложена сразу, чтобы push подключился без смены схемы."""

    __tablename__ = "device_tokens"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    fcm_token: Mapped[str] = mapped_column(String(255), unique=True)
    platform: Mapped[str] = mapped_column(String(10))  # android
    # Обновляет триггер set_updated_at (миграция 0004)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
