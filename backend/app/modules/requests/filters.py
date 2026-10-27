"""Общий фильтр заявок для списка, карты и отчётов: одни условия — одни цифры (REQ-067).

Слитые дубликаты не попадают никуда (В-18): яму считает только основная заявка.
Порядок «по приоритету» повторяет rules.priority_key, но выполняется в SQL.
"""

from dataclasses import dataclass, fields
from datetime import datetime

from sqlalchemy import ColumnElement, and_, case, false

from app.core import rules
from app.modules.requests.models import Request


@dataclass(frozen=True)
class RequestFilter:
    statuses: tuple[str, ...] | None = None
    district_id: int | None = None
    street_group: str | None = None
    defect_class: str | None = None
    contractor_id: int | None = None
    needs_group: bool | None = None
    needs_contractor: bool | None = None
    duplicate: bool | None = None
    overdue: bool | None = None
    detected_from: datetime | None = None
    detected_to: datetime | None = None

    @classmethod
    def of(cls, **values) -> "RequestFilter":
        """Из параметров запроса: лишние ключи (limit, sort) отбрасываются."""
        names = {f.name for f in fields(cls)}
        statuses = values.pop("status", None)
        return cls(
            statuses=tuple(statuses) if statuses else None,
            **{k: v for k, v in values.items() if k in names},
        )


def overdue_condition(now: datetime) -> ColumnElement[bool]:
    return and_(Request.status.in_(rules.OVERDUE_STATUSES), Request.planned_due_at < now)


def _flag(column_is_set: ColumnElement[bool], wanted: bool | None) -> ColumnElement[bool] | None:
    if wanted is None:
        return None
    return column_is_set if wanted else ~column_is_set


def conditions(f: RequestFilter, now: datetime) -> list[ColumnElement[bool]]:
    result: list[ColumnElement[bool] | None] = [Request.merged_into_id.is_(None)]
    if f.statuses:
        result.append(Request.status.in_(f.statuses))
    if f.district_id is not None:
        result.append(Request.district_id == f.district_id)
    if f.street_group is not None:
        result.append(Request.street_group == f.street_group)
    if f.defect_class is not None:
        result.append(Request.defect_class == f.defect_class)
    if f.contractor_id is not None:
        result.append(Request.contractor_id == f.contractor_id)
    if f.detected_from is not None:
        result.append(Request.detected_at >= f.detected_from)
    if f.detected_to is not None:
        result.append(Request.detected_at < f.detected_to)
    if f.detected_from and f.detected_to and f.detected_from >= f.detected_to:
        result.append(false())  # пустой период
    result.append(_flag(Request.street_group.is_(None), f.needs_group))
    result.append(_flag(Request.contractor_id.is_(None), f.needs_contractor))
    result.append(_flag(Request.duplicate_of_id.is_not(None), f.duplicate))
    result.append(_flag(overdue_condition(now), f.overdue))
    return [c for c in result if c is not None]


GROUP_RANK = case(
    {code: rank for rank, code in enumerate(rules.GROUP_ORDER)},
    value=Request.street_group,
    else_=len(rules.GROUP_ORDER),
)

# REQ-045, В-11: класс (big выше) → больше дубликатов → группа А→Е → раньше подана
# → раньше плановый срок (пустой в конце)
PRIORITY_ORDER = (
    case((Request.defect_class == "big", 0), else_=1),
    Request.duplicates_count.desc(),
    GROUP_RANK,
    Request.detected_at.asc(),
    Request.planned_due_at.asc().nulls_last(),
    Request.id,
)
NEWEST_ORDER = (Request.detected_at.desc(), Request.id.desc())
