"""Отчёты диспетчера.

Количество и среднее время — в разрезе района, подрядчика или группы улиц. Фильтр общий
с картой и списком, поэтому цифры совпадают (REQ-067); слитые дубликаты не считаются (В-18).
"""

from datetime import UTC, datetime

from sqlalchemy import ColumnElement, and_, func, literal, select
from sqlalchemy.orm import Session

from app.core.statuses import DONE, STATUSES
from app.modules.geo.models import Contractor, District
from app.modules.reports.schemas import (
    AvgTimeReport,
    AvgTimeRow,
    CountReport,
    CountRow,
    GroupBy,
    ReportKey,
)
from app.modules.requests.filters import RequestFilter, conditions, overdue_condition
from app.modules.requests.models import Request

NO_VALUE = "Не указан"


def _key_columns(group_by: GroupBy) -> tuple[ColumnElement, ColumnElement, list]:
    """(id, название, присоединения) для разреза отчёта."""
    if group_by == "district":
        return Request.district_id, District.name, [(District, District.id == Request.district_id)]
    if group_by == "contractor":
        return (
            Request.contractor_id,
            Contractor.name,
            [(Contractor, Contractor.id == Request.contractor_id)],
        )
    return literal(None), Request.street_group, []


def _key(key_id: int | None, name: str | None) -> ReportKey:
    return ReportKey(id=key_id, name=name or NO_VALUE)


def _grouped(query, joins):
    for model, on in joins:
        query = query.outerjoin(model, on)
    return query


def _sort(rows: list, attr: str) -> list:
    """Сначала самые нагруженные, «Не указан» в конце, при равенстве — по алфавиту."""
    return sorted(rows, key=lambda r: (r.key.name == NO_VALUE, -getattr(r, attr), r.key.name))


def count_report(session: Session, f: RequestFilter, group_by: GroupBy) -> CountReport:
    now = datetime.now(UTC)
    key_id, key_name, joins = _key_columns(group_by)
    done = Request.status == DONE
    on_time = and_(done, Request.completed_at <= Request.planned_due_at)
    query = _grouped(
        select(
            key_id,
            key_name,
            Request.status,
            func.count(),
            func.count().filter(on_time),
            func.count().filter(overdue_condition(now)),
        ).select_from(Request),
        joins,
    ).where(*conditions(f, now))
    rows: dict[tuple, CountRow] = {}
    for kid, name, status, count, on_time_count, overdue in session.execute(
        query.group_by(key_id, key_name, Request.status)
    ):
        row = rows.setdefault(
            (kid, name),
            CountRow(
                key=_key(kid, name),
                total=0,
                by_status=dict.fromkeys(STATUSES, 0),
                done=0,
                done_on_time=0,
                overdue=0,
            ),
        )
        row.total += count
        row.by_status[status] = count
        row.done += count if status == DONE else 0
        row.done_on_time += on_time_count
        row.overdue += overdue
    result = _sort(list(rows.values()), "total")
    return CountReport(
        group_by=group_by, rows=result, total=sum(r.total for r in result), generated_at=now
    )


def avg_time_report(session: Session, f: RequestFilter, group_by: GroupBy) -> AvgTimeReport:
    """Только выполненные заявки: completed_at − detected_at (REQ-068)."""
    now = datetime.now(UTC)
    key_id, key_name, joins = _key_columns(group_by)
    hours = func.extract("epoch", Request.completed_at - Request.detected_at) / 3600
    on_time = Request.completed_at <= Request.planned_due_at
    query = _grouped(
        select(
            key_id,
            key_name,
            func.count(),
            func.avg(hours),
            func.min(hours),
            func.max(hours),
            func.count().filter(on_time),
            func.count().filter(Request.planned_due_at.is_not(None)),
        ).select_from(Request),
        joins,
    ).where(*conditions(f, now), Request.status == DONE, Request.completed_at.is_not(None))
    rows = [
        AvgTimeRow(
            key=_key(kid, name),
            done=count,
            avg_hours=round(float(avg), 1) if avg is not None else None,
            min_hours=round(float(low), 1) if low is not None else None,
            max_hours=round(float(high), 1) if high is not None else None,
            on_time_share=round(on_time_count / with_due, 3) if with_due else None,
        )
        for kid, name, count, avg, low, high, on_time_count, with_due in session.execute(
            query.group_by(key_id, key_name)
        )
    ]
    return AvgTimeReport(group_by=group_by, rows=_sort(rows, "done"), generated_at=now)
