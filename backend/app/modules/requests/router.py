"""Заявки гражданина, диспетчера и подрядчика, карта. Реализация — PR 2-5…3-4.

Роутер проверяет роль и передаёт работу сервису: в БД он сам не ходит.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, File, Query, Response, UploadFile, status

from app.deps import CitizenUser, ContractorStaff, DbSession, DispatcherUser, Paging, Token
from app.errors import ERROR_RESPONSES, not_implemented
from app.modules.media.router import read_limited
from app.modules.requests import service
from app.modules.requests.filters import RequestFilter
from app.modules.requests.schemas import (
    CitizenRequestOut,
    ClassChange,
    ContractorAssign,
    ContractorRequestOut,
    DispatcherRequestOut,
    DispatcherRequestSummary,
    EventOut,
    MapPoint,
    MergeRequest,
    NoteCreate,
    NoteOut,
    RequestCreate,
    RequestSummary,
    StatusChange,
    StreetGroupChange,
)
from app.schemas import DefectClass, Page, StatusCode, StreetGroup

router = APIRouter(responses=ERROR_RESPONSES)


# --- Гражданин -----------------------------------------------------------------------


@router.post(
    "/requests",
    response_model=CitizenRequestOut,
    status_code=status.HTTP_201_CREATED,
    tags=["citizen"],
    summary="Подача заявки и автообработка",
)
def create_request(
    body: RequestCreate, user: CitizenUser, session: DbSession, response: Response
) -> CitizenRequestOut:
    """Повтор с тем же client_request_id отвечает 200 той же заявкой.
    409 — фото уже использовано; 422 — чужое фото или нет manual_class."""
    request, created = service.create_request(session, user.id, body)
    if not created:
        response.status_code = status.HTTP_200_OK
    return request


@router.get(
    "/me/requests", response_model=Page[RequestSummary], tags=["citizen"], summary="Мои заявки"
)
def my_requests(user: CitizenUser, paging: Paging, session: DbSession) -> Page[RequestSummary]:
    return service.my_requests(session, user.id, paging)


@router.get(
    "/me/requests/{request_id}",
    response_model=CitizenRequestOut,
    tags=["citizen"],
    summary="Моя заявка: фото и история",
)
def my_request(request_id: int, user: CitizenUser, session: DbSession) -> CitizenRequestOut:
    return service.citizen_request(session, user.id, request_id)


# --- Диспетчер -----------------------------------------------------------------------


@router.get(
    "/requests",
    response_model=Page[DispatcherRequestSummary],
    tags=["dispatcher"],
    summary="Список заявок с фильтрами",
)
def list_requests(
    paging: Paging,
    status_: Annotated[list[StatusCode] | None, Query(alias="status")] = None,
    district_id: int | None = None,
    street_group: StreetGroup | None = None,
    defect_class: DefectClass | None = None,
    contractor_id: int | None = None,
    needs_group: bool | None = None,
    needs_contractor: bool | None = None,
    duplicate: bool | None = None,
    overdue: bool | None = None,
    detected_from: datetime | None = None,
    detected_to: datetime | None = None,
    sort: Annotated[str, Query(pattern="^(priority|detected_at)$")] = "priority",
    *,
    user: DispatcherUser,
    session: DbSession,
) -> Page[DispatcherRequestSummary]:
    """sort=priority: класс → дубликаты → группа → дата подачи → плановая дата (REQ-045);
    sort=detected_at — сначала новые. Слитые заявки не показываются (В-18)."""
    f = RequestFilter.of(
        status=status_,
        district_id=district_id,
        street_group=street_group,
        defect_class=defect_class,
        contractor_id=contractor_id,
        needs_group=needs_group,
        needs_contractor=needs_contractor,
        duplicate=duplicate,
        overdue=overdue,
        detected_from=detected_from,
        detected_to=detected_to,
    )
    return service.list_requests(session, f, paging, sort)


@router.get(
    "/requests/{request_id}",
    response_model=DispatcherRequestOut,
    tags=["dispatcher"],
    summary="Карточка заявки",
)
def get_request(request_id: int, user: DispatcherUser, session: DbSession) -> DispatcherRequestOut:
    return service.dispatcher_card(session, request_id)


@router.get(
    "/requests/{request_id}/events",
    response_model=list[EventOut],
    tags=["dispatcher"],
    summary="История заявки",
)
def request_events(request_id: int, user: DispatcherUser, session: DbSession) -> list[EventOut]:
    return service.request_events(session, request_id)


@router.patch(
    "/requests/{request_id}/status",
    response_model=DispatcherRequestOut,
    tags=["dispatcher"],
    summary="Смена статуса: принять, отклонить, уточнить",
)
def change_status(
    request_id: int, body: StatusChange, user: DispatcherUser, session: DbSession
) -> DispatcherRequestOut:
    """409 — заявку уже изменили (version) или переход не разрешён таблицей ЧТЗ.
    При отклонении нужны comment и reject_reason (422); «Принято» без группы улицы — 409."""
    return service.dispatcher_change_status(session, user.id, request_id, body)


@router.patch(
    "/requests/{request_id}/class",
    response_model=DispatcherRequestOut,
    tags=["dispatcher"],
    summary="Правка класса ямы",
)
def change_class(
    request_id: int, body: ClassChange, user: DispatcherUser, session: DbSession
) -> DispatcherRequestOut:
    """Только в «На проверке» и «Требует уточнения» (В-5); рекомендация пересчитывается."""
    return service.change_class(session, user.id, request_id, body)


@router.patch(
    "/requests/{request_id}/street-group",
    response_model=DispatcherRequestOut,
    tags=["dispatcher"],
    summary="Правка группы улицы",
)
def change_street_group(
    request_id: int, body: StreetGroupChange, user: DispatcherUser, session: DbSession
) -> DispatcherRequestOut:
    """До решения по заявке (В-3); срок пересчитывается от момента обнаружения."""
    return service.change_street_group(session, user.id, request_id, body)


@router.put(
    "/requests/{request_id}/contractor",
    response_model=DispatcherRequestOut,
    tags=["dispatcher"],
    summary="Назначить или сменить подрядчика",
)
def assign_contractor(
    request_id: int, body: ContractorAssign, user: DispatcherUser, session: DbSession
) -> DispatcherRequestOut:
    """Если заявка «Принято», она сразу переходит в «В работе». Неактивный подрядчик — 422."""
    return service.assign_contractor(session, user.id, request_id, body)


@router.post(
    "/requests/{request_id}/merge",
    response_model=DispatcherRequestOut,
    tags=["dispatcher"],
    summary="Слить дубликат в основную заявку",
)
def merge_request(request_id: int, body: MergeRequest, token: Token) -> DispatcherRequestOut:
    not_implemented()


@router.delete(
    "/requests/{request_id}/duplicate-flag",
    response_model=DispatcherRequestOut,
    tags=["dispatcher"],
    summary="Снять пометку «возможный дубликат»",
)
def remove_duplicate_flag(
    request_id: int, version: Annotated[int, Query()], token: Token
) -> DispatcherRequestOut:
    not_implemented()


@router.get(
    "/requests/{request_id}/notes",
    response_model=list[NoteOut],
    tags=["dispatcher"],
    summary="Внутренние заметки",
)
def list_notes(request_id: int, user: DispatcherUser, session: DbSession) -> list[NoteOut]:
    return service.list_notes(session, request_id)


@router.post(
    "/requests/{request_id}/notes",
    response_model=NoteOut,
    status_code=status.HTTP_201_CREATED,
    tags=["dispatcher"],
    summary="Добавить заметку",
)
def add_note(
    request_id: int, body: NoteCreate, user: DispatcherUser, session: DbSession
) -> NoteOut:
    """Заметку видят только диспетчеры; в истории появляется событие note_added."""
    return service.add_note(session, user.id, request_id, body.text)


@router.get(
    "/map/points", response_model=list[MapPoint], tags=["dispatcher"], summary="Заявки на карте"
)
def map_points(
    token: Token,
    bbox: Annotated[
        str, Query(description="запад,юг,восток,север", examples=["84.9,56.4,85.1,56.5"])
    ],
    status_: Annotated[list[StatusCode] | None, Query(alias="status")] = None,
    defect_class: DefectClass | None = None,
    district_id: int | None = None,
    street_group: StreetGroup | None = None,
    contractor_id: int | None = None,
    detected_from: datetime | None = None,
    detected_to: datetime | None = None,
) -> list[MapPoint]:
    """Те же фильтры, что у /requests (отчёт = карта); только видимая область.
    bbox в порядке Leaflet map.getBounds().toBBoxString(): запад,юг,восток,север."""
    not_implemented()


# --- Подрядчик -----------------------------------------------------------------------


@router.get(
    "/contractor/requests",
    response_model=Page[RequestSummary],
    tags=["contractor"],
    summary="Заявки моей организации",
)
def contractor_requests(
    user: ContractorStaff, paging: Paging, session: DbSession, overdue: bool | None = None
) -> Page[RequestSummary]:
    return service.contractor_requests(session, user.contractor_id, paging, overdue)


@router.get(
    "/contractor/requests/{request_id}",
    response_model=ContractorRequestOut,
    tags=["contractor"],
    summary="Заявка моей организации",
)
def contractor_request(
    request_id: int, user: ContractorStaff, session: DbSession
) -> ContractorRequestOut:
    """Чужая заявка — 404."""
    return service.contractor_card(session, user.contractor_id, request_id)


@router.post(
    "/contractor/requests/{request_id}/complete",
    response_model=ContractorRequestOut,
    tags=["contractor"],
    summary="Выполнено: фото «после»",
)
def complete_request(
    request_id: int,
    image: Annotated[UploadFile, File(description="фото «после»: JPEG или PNG")],
    user: ContractorStaff,
    session: DbSession,
) -> ContractorRequestOut:
    """Фото, статус «Выполнено» и дата выполнения — одной транзакцией (REQ-063)."""
    data = read_limited(image)
    return service.complete(session, user.id, user.contractor_id, request_id, data)
