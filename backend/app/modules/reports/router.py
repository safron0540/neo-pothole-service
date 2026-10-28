"""Отчёты диспетчера, рейтинг и история подрядчика (REQ-065…068, 070)."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import DbSession, DispatcherUser, Paging
from app.errors import ERROR_RESPONSES
from app.modules.reports import service
from app.modules.reports.schemas import (
    AvgTimeReport,
    CountReport,
    GroupBy,
    HistoryRow,
    RatingRow,
)
from app.modules.requests.filters import RequestFilter
from app.schemas import DefectClass, Page, StatusCode, StreetGroup

router = APIRouter(tags=["reports"], responses=ERROR_RESPONSES)


def report_filter(
    status_: Annotated[list[StatusCode] | None, Query(alias="status")] = None,
    district_id: int | None = None,
    street_group: StreetGroup | None = None,
    defect_class: DefectClass | None = None,
    contractor_id: int | None = None,
    detected_from: datetime | None = None,
    detected_to: datetime | None = None,
) -> RequestFilter:
    """Те же фильтры, что у /requests и /map/points: отчёт = карта (REQ-067)."""
    return RequestFilter.of(
        status=status_,
        district_id=district_id,
        street_group=street_group,
        defect_class=defect_class,
        contractor_id=contractor_id,
        detected_from=detected_from,
        detected_to=detected_to,
    )


@router.get("/reports/count", response_model=CountReport, summary="Отчёт: количество заявок")
def count_report(
    user: DispatcherUser,
    session: DbSession,
    group_by: GroupBy = "district",
    status_: Annotated[list[StatusCode] | None, Query(alias="status")] = None,
    district_id: int | None = None,
    street_group: StreetGroup | None = None,
    defect_class: DefectClass | None = None,
    contractor_id: int | None = None,
    detected_from: datetime | None = None,
    detected_to: datetime | None = None,
) -> CountReport:
    """Строки по районам, подрядчикам или группам улиц: всего, по статусам, выполнено,
    в срок, просрочено. Слитые дубликаты не считаются (В-18)."""
    f = report_filter(
        status_, district_id, street_group, defect_class, contractor_id, detected_from, detected_to
    )
    return service.count_report(session, f, group_by)


@router.get(
    "/reports/avg-time", response_model=AvgTimeReport, summary="Отчёт: среднее время выполнения"
)
def avg_time_report(
    user: DispatcherUser,
    session: DbSession,
    group_by: GroupBy = "district",
    district_id: int | None = None,
    street_group: StreetGroup | None = None,
    defect_class: DefectClass | None = None,
    contractor_id: int | None = None,
    detected_from: datetime | None = None,
    detected_to: datetime | None = None,
) -> AvgTimeReport:
    """По выполненным заявкам: среднее, минимум и максимум часов от обнаружения до
    выполнения, доля выполненных в срок."""
    f = report_filter(
        None, district_id, street_group, defect_class, contractor_id, detected_from, detected_to
    )
    return service.avg_time_report(session, f, group_by)


@router.get("/contractors/rating", response_model=list[RatingRow], summary="Рейтинг подрядчиков")
def contractor_rating(
    user: DispatcherUser,
    session: DbSession,
    district_id: int | None = None,
    street_group: StreetGroup | None = None,
    defect_class: DefectClass | None = None,
    detected_from: datetime | None = None,
    detected_to: datetime | None = None,
) -> list[RatingRow]:
    """По доле выполненных в срок (completed_at ≤ planned_due_at [D]), затем по числу
    выполненных. Срок — от обнаружения (В-17 а); avg_work_hours — от «В работе» (В-17 б)."""
    f = report_filter(
        None, district_id, street_group, defect_class, None, detected_from, detected_to
    )
    return service.contractor_rating(session, f)


@router.get(
    "/contractors/{contractor_id}/history",
    response_model=Page[HistoryRow],
    summary="История заявок подрядчика",
)
def contractor_history(
    contractor_id: int, user: DispatcherUser, session: DbSession, paging: Paging
) -> Page[HistoryRow]:
    """Все заявки подрядчика, сначала новые: срок, дата выполнения, в срок или нет."""
    return service.contractor_history(session, contractor_id, paging)
