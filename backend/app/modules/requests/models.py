"""Заявки, история и заметки диспетчеров — docs/db-schema.md, раздел 4.3.

Статус меняет только change_status() (появится в PR 2-6). Адрес, дом, район и группа
копируются в заявку при подаче (снимок) и не меняются при правке справочников.
"""

import uuid
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import (
    REAL,
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import CHAR, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.statuses import ON_REVIEW, STATUSES
from app.db import Base

EVENT_TYPES = (
    "created",
    "processed",
    "status_changed",
    "class_changed",
    "group_changed",
    "contractor_changed",
    "merged",
    "duplicate_flag_removed",
    "note_added",
)
# [D] В-2: причина отклонения; в плановый ремонт идут только small_pit
REJECT_REASONS = ("small_pit", "not_a_pit", "duplicate", "other")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Request(Base):
    __tablename__ = "requests"
    __table_args__ = (
        UniqueConstraint("author_id", "client_request_id"),
        CheckConstraint(_in("status", STATUSES), name="status"),
        CheckConstraint("defect_class IN ('big', 'small')", name="defect_class"),
        CheckConstraint("model_class IN ('big', 'small')", name="model_class"),
        CheckConstraint("class_source IN ('model', 'citizen', 'dispatcher')", name="class_source"),
        CheckConstraint(_in("reject_reason", REJECT_REASONS), name="reject_reason"),
        CheckConstraint("pits_count >= 1", name="pits_count_positive"),
        CheckConstraint("duplicates_count >= 0", name="duplicates_count_not_negative"),
        CheckConstraint("duplicate_of_id <> id", name="not_duplicate_of_itself"),
        CheckConstraint("merged_into_id <> id", name="not_merged_into_itself"),
        # Слитые заявки повторяют статус основной, поэтому правила ниже их не касаются
        CheckConstraint(
            "status <> 'in_progress' OR contractor_id IS NOT NULL OR merged_into_id IS NOT NULL",
            name="in_work_has_contractor",
        ),
        CheckConstraint(
            "status <> 'done' OR merged_into_id IS NOT NULL"
            " OR (after_photo_id IS NOT NULL AND completed_at IS NOT NULL)",
            name="done_has_after_photo",
        ),
        # [D] В-3: без группы улицы (значит, без срока) заявку не принять
        CheckConstraint(
            "status NOT IN ('accepted', 'in_progress', 'done')"
            " OR planned_due_at IS NOT NULL OR merged_into_id IS NOT NULL",
            name="accepted_has_due_date",
        ),
        Index("ix_requests_location", "location", postgresql_using="gist"),
        Index("ix_requests_status_detected_at", "status", "detected_at"),
        Index(
            "ix_requests_on_review_detected_at",
            "detected_at",
            postgresql_where=text("status = 'on_review'"),
        ),
        Index("ix_requests_contractor_id_status", "contractor_id", "status"),
        Index("ix_requests_author_id_detected_at", "author_id", text("detected_at DESC")),
        Index(
            "ix_requests_overdue_planned_due_at",
            "planned_due_at",
            postgresql_where=text("status IN ('accepted', 'in_progress')"),
        ),
        Index("ix_requests_merged_into_id", "merged_into_id"),
        Index("ix_requests_street_id_segment_idx", "street_id", "segment_idx"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    # Генерирует приложение; повтор POST /requests с тем же значением вернёт ту же заявку
    client_request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    author_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("citizens.user_id", ondelete="RESTRICT")
    )
    before_photo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("photos.id", ondelete="RESTRICT"), unique=True
    )
    after_photo_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("photos.id", ondelete="RESTRICT"), unique=True
    )
    location = mapped_column(Geography("POINT", srid=4326, spatial_index=False), nullable=False)
    accuracy_m: Mapped[float | None] = mapped_column(REAL)

    # Снимок на момент подачи
    address: Mapped[str | None] = mapped_column(String(300))
    house_number: Mapped[str | None] = mapped_column(String(20))
    district_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("districts.id", ondelete="RESTRICT")
    )
    street_group: Mapped[str | None] = mapped_column(
        CHAR(1), ForeignKey("street_groups.code", ondelete="RESTRICT")
    )
    street_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("streets.id", ondelete="RESTRICT")
    )
    segment_idx: Mapped[int | None] = mapped_column(Integer)

    defect_class: Mapped[str] = mapped_column(String(5))
    model_class: Mapped[str | None] = mapped_column(String(5))
    class_source: Mapped[str] = mapped_column(String(10))
    pits_count: Mapped[int] = mapped_column(Integer, server_default="1")

    status: Mapped[str] = mapped_column(String(20), server_default=ON_REVIEW)
    reject_reason: Mapped[str | None] = mapped_column(String(10))
    decision_comment: Mapped[str | None] = mapped_column(Text)
    citizen_comment: Mapped[str | None] = mapped_column(Text)

    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    planned_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    contractor_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("contractors.id", ondelete="RESTRICT")
    )
    duplicate_of_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("requests.id", ondelete="RESTRICT")
    )
    merged_into_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("requests.id", ondelete="RESTRICT")
    )
    duplicates_count: Mapped[int] = mapped_column(Integer, server_default="0")

    # Оптимистичная блокировка: +1 при каждом изменении, конфликт → 409
    version: Mapped[int] = mapped_column(Integer, server_default="1")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RequestEvent(Base):
    """История заявки. Строки не меняются и не удаляются."""

    __tablename__ = "request_events"
    __table_args__ = (
        CheckConstraint(_in("type", EVENT_TYPES), name="type"),
        Index("ix_request_events_request_id_created_at", "request_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    request_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("requests.id", ondelete="RESTRICT")
    )
    # Пусто у действий системы: автообработка, автопереход в «В работе»
    actor_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="RESTRICT")
    )
    type: Mapped[str] = mapped_column(String(30))
    payload: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class InternalNote(Base):
    """Заметка диспетчера. Гражданин и подрядчик её не видят."""

    __tablename__ = "internal_notes"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    request_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("requests.id", ondelete="RESTRICT")
    )
    author_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
