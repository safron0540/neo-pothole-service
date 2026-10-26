"""Плановый ремонт: предложения по участкам улиц 100 м (REQ-046, UC-10)."""

from fastapi import APIRouter

from app.deps import DbSession, DispatcherUser, Paging
from app.errors import ERROR_RESPONSES
from app.modules.planned_repair import service
from app.modules.planned_repair.schemas import PlannedRepairDetail, PlannedRepairOut, ProposalStatus
from app.schemas import Page, StreetGroup

router = APIRouter(tags=["reports"], responses=ERROR_RESPONSES)


@router.get(
    "/planned-repairs",
    response_model=Page[PlannedRepairOut],
    summary="Предложения планового ремонта",
)
def list_planned_repairs(
    user: DispatcherUser,
    session: DbSession,
    paging: Paging,
    status: ProposalStatus | None = "open",
    district_id: int | None = None,
    street_group: StreetGroup | None = None,
) -> Page[PlannedRepairOut]:
    """По умолчанию только открытые. Предложение открывается, когда отклонённых малых ям
    на участке 100 м больше порога группы улицы, и закрывается само, когда их не больше [D]."""
    return service.list_proposals(session, paging, status, district_id, street_group)


@router.get(
    "/planned-repairs/{proposal_id}",
    response_model=PlannedRepairDetail,
    summary="Предложение и его заявки",
)
def get_planned_repair(
    proposal_id: int, user: DispatcherUser, session: DbSession
) -> PlannedRepairDetail:
    return service.get_proposal(session, proposal_id)
