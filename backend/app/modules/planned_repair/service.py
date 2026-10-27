"""Плановый ремонт: пересчёт предложения по участку улицы и просмотр предложений.

Правило (docs/architecture.md, 9.5): отклонённые с причиной small_pit малые не слитые
заявки участка (одна заявка — одна яма, В-15) сравниваются с порогом текущей группы улицы
(В-14). Больше порога — предложение открыто, иначе закрыто. Диспетчер решает по открытому
[D] (В-16): включить в план (planned, участок больше не пересчитывается в open/closed),
оставить точечный ремонт (declined); включённое в план потом отмечается выполненным (done).
После declined и done ямы считаются заново, с момента решения: набралось больше порога —
предложение снова открыто. Состав предложения не хранится: он считается запросом.
"""

import json
from datetime import UTC, datetime

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.statuses import REJECTED
from app.deps import Pagination
from app.errors import ApiError
from app.modules.geo.models import District, Street, StreetGroup
from app.modules.planned_repair.models import PlannedRepairProposal
from app.modules.planned_repair.schemas import (
    Decision,
    DecisionIn,
    PlannedRepairDetail,
    PlannedRepairOut,
)
from app.modules.requests.models import Request
from app.modules.requests.schemas import RequestSummary
from app.schemas import Page, Point, Ref, StatusOut

PLANNED_REASON = "small_pit"  # В-2: только эти отклонения идут в плановый ремонт

# [D] В-16: решение → (из каких статусов можно, какой статус ставится)
DECISIONS: dict[Decision, tuple[tuple[str, ...], str]] = {
    "plan": (("open",), "planned"),
    "spot": (("open",), "declined"),
    "done": (("planned",), "done"),
}
RESTART_COUNT = ("declined", "done")  # после них ямы считаются с момента решения


def _counted(street_id: int, segment_idx: int, since: datetime | None = None):
    conditions = [
        Request.street_id == street_id,
        Request.segment_idx == segment_idx,
        Request.status == REJECTED,
        Request.reject_reason == PLANNED_REASON,
        Request.defect_class == "small",
        Request.merged_into_id.is_(None),
    ]
    if since is not None:
        conditions.append(Request.detected_at > since)
    return conditions


def recalc_segment(session: Session, street_id: int, segment_idx: int) -> None:
    """Пересчитать участок в той же транзакции, что и вызвавшее его действие."""
    proposal = session.scalar(
        select(PlannedRepairProposal)
        .where(
            PlannedRepairProposal.street_id == street_id,
            PlannedRepairProposal.segment_idx == segment_idx,
        )
        .with_for_update()
    )
    since = proposal.counted_since if proposal else None
    pits = session.scalar(select(func.count()).where(*_counted(street_id, segment_idx, since)))
    threshold = session.scalar(
        select(StreetGroup.max_pits)
        .join(Street, Street.street_group == StreetGroup.code)
        .where(Street.id == street_id)
    )
    is_open = threshold is not None and pits > threshold
    if proposal is None:
        if is_open:
            session.add(
                PlannedRepairProposal(
                    street_id=street_id,
                    segment_idx=segment_idx,
                    pits_count=pits,
                    threshold=threshold,
                    status="open",
                )
            )
            session.flush()
        return
    proposal.pits_count = pits
    if threshold is not None:
        proposal.threshold = threshold
    if proposal.status in ("open", "closed"):
        proposal.status = "open" if is_open else "closed"
    elif proposal.status in RESTART_COUNT and is_open:
        proposal.status = "open"  # после решения снова набрался порог
    session.flush()


def recalc_for_request(session: Session, request: Request) -> None:
    """Малая яма на известном участке: её отклонение или слияние меняет счётчик участка."""
    if request.defect_class == "small" and request.street_id is not None:
        if request.segment_idx is not None:
            recalc_segment(session, request.street_id, request.segment_idx)


def recalc_streets(session: Session, street_ids: list[int]) -> None:
    """После смены группы улицы или порога группы: все участки этих улиц с ямами или
    с предложениями."""
    if not street_ids:
        return
    segments = session.execute(
        select(Request.street_id, Request.segment_idx)
        .where(
            Request.street_id.in_(street_ids),
            Request.segment_idx.is_not(None),
            Request.reject_reason == PLANNED_REASON,
        )
        .union(
            select(PlannedRepairProposal.street_id, PlannedRepairProposal.segment_idx).where(
                PlannedRepairProposal.street_id.in_(street_ids)
            )
        )
    ).all()
    for street_id, segment_idx in segments:
        recalc_segment(session, street_id, segment_idx)


def recalc_group(session: Session, code: str) -> None:
    recalc_streets(
        session, list(session.scalars(select(Street.id).where(Street.street_group == code)))
    )


# --- Просмотр -----------------------------------------------------------------------------


def _geometry(session: Session, street_id: int, segment_idx: int) -> tuple[dict, Point]:
    """Участок [idx·100 м; (idx+1)·100 м] линии улицы и его середина."""
    segment, lat, lon = session.execute(
        text(
            "SELECT ST_AsGeoJSON(s, 7), ST_Y(ST_LineInterpolatePoint(s, 0.5)),"
            " ST_X(ST_LineInterpolatePoint(s, 0.5)) FROM (SELECT ST_LineSubstring(geom::geometry,"
            " LEAST(:i * 100 / ST_Length(geom), 1), LEAST((:i + 1) * 100 / ST_Length(geom), 1))"
            " AS s FROM streets WHERE id = :id) x"
        ),
        {"i": segment_idx, "id": street_id},
    ).one()
    return json.loads(segment), Point(lat=lat, lon=lon)


def _out(session: Session, proposal, street: Street, district: str | None) -> dict:
    segment, center = _geometry(session, street.id, proposal.segment_idx)
    return {
        "id": proposal.id,
        "street": Ref(id=street.id, name=street.name),
        "district": Ref(id=street.district_id, name=district) if district else None,
        "street_group": street.street_group,
        "segment_idx": proposal.segment_idx,
        "segment": segment,
        "center": center,
        "pits_count": proposal.pits_count,
        "threshold": proposal.threshold,
        "status": proposal.status,
        "decided_at": proposal.decided_at,
        "decision_comment": proposal.decision_comment,
        "created_at": proposal.created_at,
        "updated_at": proposal.updated_at,
    }


def _joined():
    return (
        select(PlannedRepairProposal, Street, District.name)
        .join(Street, Street.id == PlannedRepairProposal.street_id)
        .outerjoin(District, District.id == Street.district_id)
    )


def list_proposals(
    session: Session,
    paging: Pagination,
    status: str | None,
    district_id: int | None,
    street_group: str | None,
) -> Page[PlannedRepairOut]:
    """Сначала открытые с наибольшим числом ям, потом новые."""
    where = []
    if status is not None:
        where.append(PlannedRepairProposal.status == status)
    if district_id is not None:
        where.append(Street.district_id == district_id)
    if street_group is not None:
        where.append(Street.street_group == street_group)
    total = session.scalar(
        select(func.count())
        .select_from(PlannedRepairProposal)
        .join(Street, Street.id == PlannedRepairProposal.street_id)
        .where(*where)
    )
    rows = session.execute(
        _joined()
        .where(*where)
        .order_by(
            (PlannedRepairProposal.status == "open").desc(),
            PlannedRepairProposal.pits_count.desc(),
            PlannedRepairProposal.created_at.desc(),
            PlannedRepairProposal.id,
        )
        .limit(paging.limit)
        .offset(paging.offset)
    ).all()
    return Page(
        items=[PlannedRepairOut(**_out(session, p, s, d)) for p, s, d in rows],
        total=total,
        limit=paging.limit,
        offset=paging.offset,
    )


def get_proposal(session: Session, proposal_id: int) -> PlannedRepairDetail:
    row = session.execute(_joined().where(PlannedRepairProposal.id == proposal_id)).one_or_none()
    if row is None:
        raise ApiError(404, "not_found", "Предложение не найдено")
    proposal, street, district = row
    requests = session.scalars(
        select(Request)
        .where(*_counted(street.id, proposal.segment_idx, proposal.counted_since))
        .order_by(Request.detected_at, Request.id)
    )
    return PlannedRepairDetail(
        **_out(session, proposal, street, district),
        requests=[
            RequestSummary(
                id=r.id,
                status=StatusOut.of(r.status),
                defect_class=r.defect_class,
                address=r.address,
                detected_at=r.detected_at,
                planned_due_at=r.planned_due_at,
                is_overdue=False,  # отклонённые не бывают просрочены (REQ-062)
            )
            for r in requests
        ],
    )


def decide(
    session: Session, actor_id: int, proposal_id: int, body: DecisionIn
) -> PlannedRepairDetail:
    """POST /planned-repairs/{id}/decision: в план, точечный ремонт, выполнено (В-16)."""
    proposal = session.scalar(
        select(PlannedRepairProposal)
        .where(PlannedRepairProposal.id == proposal_id)
        .with_for_update()
    )
    if proposal is None:
        raise ApiError(404, "not_found", "Предложение не найдено")
    allowed, target = DECISIONS[body.decision]
    if proposal.status not in allowed:
        raise ApiError(
            409,
            "invalid_transition",
            "Предложение уже в другом состоянии: обновите страницу",
            {"status": proposal.status},
        )
    now = datetime.now(UTC)
    proposal.status = target
    proposal.decided_at = now
    proposal.decided_by = actor_id
    proposal.decision_comment = body.comment
    if target in RESTART_COUNT:
        proposal.counted_since = now
        proposal.pits_count = 0
    session.commit()
    return get_proposal(session, proposal_id)
