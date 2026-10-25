"""Пользователи и доступ: учётные записи, профили ролей, согласия, refresh-токены.

Поля и ограничения — docs/db-schema.md, раздел 4.2. Пользователей не удаляем,
а отключаем (is_active = false), поэтому CASCADE срабатывает только при ручной чистке.
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    String,
    func,
    true,
)
from sqlalchemy.dialects.postgresql import CHAR
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('citizen', 'dispatcher', 'contractor')", name="role"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    # У гражданина это email, у сотрудника логин от диспетчера; хранится в нижнем регистре
    login: Mapped[str] = mapped_column(String(254), unique=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(12))
    password_hash: Mapped[str] = mapped_column(String(255))  # argon2, сам пароль не хранится
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Citizen(Base):
    """Профиль гражданина. Роль citizen проверяет триггер check_user_role."""

    __tablename__ = "citizens"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    phone: Mapped[str] = mapped_column(String(16), unique=True)  # E.164


class ContractorUser(Base):
    """Сотрудник подрядчика. Роль contractor проверяет триггер check_user_role."""

    __tablename__ = "contractor_users"
    __table_args__ = (Index("ix_contractor_users_contractor_id", "contractor_id"),)

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    contractor_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("contractors.id", ondelete="RESTRICT")
    )


class UserConsent(Base):
    """Согласие на ПДн (pd) или геолокацию (geo) для конкретной версии текста."""

    __tablename__ = "user_consents"
    __table_args__ = (CheckConstraint("kind IN ('pd', 'geo')", name="kind"),)

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    kind: Mapped[str] = mapped_column(String(3), primary_key=True)
    doc_version: Mapped[str] = mapped_column(String(20), primary_key=True)
    accepted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class RefreshToken(Base):
    """Выданный refresh-токен. В БД только SHA-256; отозванные строки не удаляются."""

    __tablename__ = "refresh_tokens"
    __table_args__ = (Index("ix_refresh_tokens_user_id", "user_id"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(CHAR(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
