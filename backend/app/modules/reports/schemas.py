"""Отчёты диспетчера (REQ-067, 068, 070): JSON для таблицы, Excel собирает веб (SheetJS)."""

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas import DefectClass, Ref, StatusCode, StatusOut, UtcDateTime

GroupBy = Literal["district", "contractor", "street_group"]


class ReportKey(BaseModel):
    """Строка разреза: район, подрядчик или группа улиц. Без значения — «Не указан»."""

    id: int | None = Field(description="id района или подрядчика; у группы улиц пусто")
    name: str


class CountRow(BaseModel):
    key: ReportKey
    total: int
    by_status: dict[StatusCode, int]
    done: int
    done_on_time: int = Field(description="выполнено не позже плановой даты [D]")
    overdue: int = Field(description="сейчас в работе и срок прошёл")


class CountReport(BaseModel):
    group_by: GroupBy
    rows: list[CountRow]
    total: int
    generated_at: UtcDateTime


class AvgTimeRow(BaseModel):
    key: ReportKey
    done: int
    avg_hours: float | None = Field(description="от обнаружения до выполнения (REQ-068)")
    min_hours: float | None
    max_hours: float | None
    on_time_share: float | None = Field(description="доля выполненных в срок, 0…1")


class AvgTimeReport(BaseModel):
    group_by: GroupBy
    rows: list[AvgTimeRow]
    generated_at: UtcDateTime


class RatingRow(BaseModel):
    """Строка рейтинга подрядчика (REQ-066). Срок считается от обнаружения (В-17 а)."""

    place: int
    contractor: Ref
    is_active: bool
    done: int
    done_on_time: int
    on_time_share: float | None = Field(description="доля выполненных в срок, 0…1")
    in_progress: int
    overdue_now: int = Field(description="сейчас в работе и срок прошёл")
    avg_hours: float | None = Field(description="от обнаружения до выполнения")
    avg_work_hours: float | None = Field(description="от «В работе» до выполнения (В-17 б)")


class HistoryRow(BaseModel):
    """Заявка в истории подрядчика (REQ-065)."""

    id: int
    status: StatusOut
    defect_class: DefectClass
    address: str | None
    detected_at: UtcDateTime
    planned_due_at: UtcDateTime | None
    completed_at: UtcDateTime | None
    on_time: bool | None = Field(description="пусто, пока не выполнена")
    hours: float | None = Field(description="от обнаружения до выполнения")
    is_overdue: bool
