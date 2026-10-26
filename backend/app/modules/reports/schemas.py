"""Отчёты диспетчера (REQ-067, 068, 070): JSON для таблицы, Excel собирает веб (SheetJS)."""

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas import StatusCode, UtcDateTime

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
