"""Предложения планового ремонта (REQ-046, UC-10): участок улицы 100 м с малыми ямами."""

from typing import Literal

from pydantic import BaseModel, Field

from app.modules.requests.schemas import RequestSummary
from app.schemas import GeoLineString, Point, Ref, StreetGroup, UtcDateTime

# open/closed ставит пересчёт; planned, declined, done — решение диспетчера (В-16)
ProposalStatus = Literal["open", "closed", "planned", "declined", "done"]
# plan — включить в план, spot — оставить точечный ремонт, done — ремонт по плану выполнен
Decision = Literal["plan", "spot", "done"]


class PlannedRepairOut(BaseModel):
    id: int
    street: Ref
    district: Ref | None
    street_group: StreetGroup | None = Field(description="текущая группа улицы (В-14)")
    segment_idx: int = Field(description="номер участка 100 м от начала линии улицы")
    segment: GeoLineString = Field(description="сам участок для карты, [долгота, широта]")
    center: Point
    pits_count: int = Field(description="отклонённых малых ям с причиной small_pit (В-15)")
    threshold: int = Field(description="порог группы: открыто, если ям больше порога")
    status: ProposalStatus
    decided_at: UtcDateTime | None = Field(description="когда диспетчер принял решение")
    decision_comment: str | None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class PlannedRepairDetail(PlannedRepairOut):
    requests: list[RequestSummary] = Field(description="заявки, из которых сложилось предложение")


class DecisionIn(BaseModel):
    decision: Decision = Field(
        description="plan и spot — из open; done — из planned. Иначе 409 invalid_transition"
    )
    comment: str | None = Field(None, max_length=1000)
