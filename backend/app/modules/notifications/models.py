"""Уведомления гражданину и токены устройств для push (этап 2)."""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    String,
    UniqueConstraint,
    false,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Notification(Base):
    """Уведомление о смене статуса. Приложение забирает их опросом раз в 30 с."""

    __tablename__ = "notifications"
    __table_args__ = (
        # По одному событию пользователь получает одно уведомление
        UniqueConstraint("user_id", "event_id"),
        Index("ix_notifications_user_id_created_at", "user_id", text("created_at DESC")),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"))
    request_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("requests.id", ondelete="RESTRICT")
    )
    event_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("request_events.id", ondelete="RESTRICT")
    )
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(String(500))
    is_read: Mapped[bool] = mapped_column(Boolean, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DeviceToken(Base):
    """FCM-токен телефона. Таблица заложена сразу, чтобы push подключился без смены схемы."""

    __tablename__ = "device_tokens"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    fcm_token: Mapped[str] = mapped_column(String(255), unique=True)
    platform: Mapped[str] = mapped_column(String(10))  # android
    # Обновляет триггер set_updated_at (миграция 0004)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
