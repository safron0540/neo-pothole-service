"""Предложения планового ремонта: участок улицы 100 м с отклонёнными малыми ямами.

Состав предложения не хранится: он считается запросом по street_id и segment_idx.
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PlannedRepairProposal(Base):
    __tablename__ = "planned_repair_proposals"
    __table_args__ = (
        UniqueConstraint("street_id", "segment_idx"),
        CheckConstraint("segment_idx >= 0", name="segment_idx_not_negative"),
        CheckConstraint("status IN ('open', 'closed')", name="status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    street_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("streets.id", ondelete="RESTRICT")
    )
    segment_idx: Mapped[int] = mapped_column(Integer)
    pits_count: Mapped[int] = mapped_column(Integer)  # снимок последнего пересчёта
    threshold: Mapped[int] = mapped_column(Integer)  # порог группы на момент пересчёта
    status: Mapped[str] = mapped_column(String(6))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
