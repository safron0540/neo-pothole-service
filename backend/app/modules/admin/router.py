"""Справочники и сотрудники (диспетчер). Сотрудники — PR 4-3.

Справочник, на который ссылаются заявки, не удаляется: 409 (UC-12 А2).
"""

from fastapi import APIRouter, status

from app.deps import DbSession, DispatcherUser, Paging, Token
from app.errors import ERROR_RESPONSES, not_implemented
from app.modules.admin import service
from app.modules.admin.schemas import (
    ContractorIn,
    ContractorOut,
    ContractorUpdate,
    DistrictIn,
    DistrictOut,
    PasswordReset,
    StreetGroupOut,
    StreetGroupUpdate,
    StreetIn,
    StreetOut,
    StreetUpdate,
    UserCreate,
    UserOut,
    UserUpdate,
)
from app.schemas import Page, Role, StreetGroup

router = APIRouter(tags=["admin"], responses=ERROR_RESPONSES)


# --- Районы ---------------------------------------------------------------------------


@router.get("/districts", response_model=list[DistrictOut], summary="Районы")
def list_districts(user: DispatcherUser, session: DbSession) -> list[DistrictOut]:
    return service.list_districts(session)


@router.post(
    "/districts",
    response_model=DistrictOut,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить район",
)
def create_district(body: DistrictIn, user: DispatcherUser, session: DbSession) -> DistrictOut:
    return service.create_district(session, body.name)


@router.patch("/districts/{district_id}", response_model=DistrictOut, summary="Переименовать район")
def update_district(
    district_id: int, body: DistrictIn, user: DispatcherUser, session: DbSession
) -> DistrictOut:
    return service.update_district(session, district_id, body.name)


@router.delete(
    "/districts/{district_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить район"
)
def delete_district(district_id: int, user: DispatcherUser, session: DbSession) -> None:
    """Район, на который ссылаются улицы или заявки, не удаляется: 409."""
    service.delete_district(session, district_id)


# --- Группы улиц ----------------------------------------------------------------------


@router.get("/street-groups", response_model=list[StreetGroupOut], summary="Группы улиц А–Е")
def list_street_groups(user: DispatcherUser, session: DbSession) -> list[StreetGroupOut]:
    return service.list_street_groups(session)


@router.put(
    "/street-groups/{code}", response_model=StreetGroupOut, summary="Срок и порог группы улиц"
)
def update_street_group(
    code: StreetGroup, body: StreetGroupUpdate, user: DispatcherUser, session: DbSession
) -> StreetGroupOut:
    """Новый срок действует для новых заявок; рассчитанные сроки не меняются (REQ-074)."""
    return service.update_street_group(session, code, body)


# --- Улицы ----------------------------------------------------------------------------


@router.get("/streets", response_model=Page[StreetOut], summary="Улицы")
def list_streets(
    user: DispatcherUser,
    session: DbSession,
    paging: Paging,
    q: str | None = None,
    district_id: int | None = None,
    street_group: StreetGroup | None = None,
) -> Page[StreetOut]:
    return service.list_streets(session, paging, q, district_id, street_group)


@router.post(
    "/streets",
    response_model=StreetOut,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить улицу",
)
def create_street(body: StreetIn, user: DispatcherUser, session: DbSession) -> StreetOut:
    return service.create_street(session, body)


@router.patch("/streets/{street_id}", response_model=StreetOut, summary="Изменить улицу")
def update_street(
    street_id: int, body: StreetUpdate, user: DispatcherUser, session: DbSession
) -> StreetOut:
    """Правка не меняет уже поданные заявки: адрес и группа в них — снимок.
    Меняются только переданные поля; street_group: null снимает группу."""
    return service.update_street(session, street_id, body)


@router.delete(
    "/streets/{street_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить улицу"
)
def delete_street(street_id: int, user: DispatcherUser, session: DbSession) -> None:
    service.delete_street(session, street_id)


# --- Подрядчики -----------------------------------------------------------------------


@router.get("/contractors", response_model=list[ContractorOut], summary="Подрядчики")
def list_contractors(
    user: DispatcherUser, session: DbSession, is_active: bool | None = None
) -> list[ContractorOut]:
    return service.list_contractors(session, is_active)


@router.post(
    "/contractors",
    response_model=ContractorOut,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить подрядчика",
)
def create_contractor(
    body: ContractorIn, user: DispatcherUser, session: DbSession
) -> ContractorOut:
    """422 — зона некорректна или пересекается с чужой."""
    return service.create_contractor(session, body)


@router.patch(
    "/contractors/{contractor_id}", response_model=ContractorOut, summary="Изменить подрядчика"
)
def update_contractor(
    contractor_id: int, body: ContractorUpdate, user: DispatcherUser, session: DbSession
) -> ContractorOut:
    """Меняются только переданные поля; is_active: false — подрядчику больше не назначают."""
    return service.update_contractor(session, contractor_id, body)


@router.delete(
    "/contractors/{contractor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить подрядчика",
)
def delete_contractor(contractor_id: int, user: DispatcherUser, session: DbSession) -> None:
    """Если на подрядчика ссылаются заявки — 409, предлагается сделать его неактивным."""
    service.delete_contractor(session, contractor_id)


# --- Сотрудники -----------------------------------------------------------------------


@router.get("/users", response_model=Page[UserOut], summary="Пользователи")
def list_users(
    token: Token, paging: Paging, role: Role | None = None, is_active: bool | None = None
) -> Page[UserOut]:
    not_implemented()


@router.post(
    "/users",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить сотрудника",
)
def create_user(body: UserCreate, token: Token) -> UserOut:
    not_implemented()


@router.patch("/users/{user_id}", response_model=UserOut, summary="Изменить или отключить")
def update_user(user_id: int, body: UserUpdate, token: Token) -> UserOut:
    """При отключении отзываются все refresh-токены пользователя."""
    not_implemented()


@router.post(
    "/users/{user_id}/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Новый пароль сотрудника",
)
def reset_password(user_id: int, body: PasswordReset, token: Token) -> None:
    not_implemented()
