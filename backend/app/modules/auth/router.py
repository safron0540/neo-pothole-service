"""Вход: раздельно для граждан и сотрудников (REQ-001)."""

from fastapi import APIRouter, status

from app.deps import AnyUser, DbSession
from app.errors import ERROR_RESPONSES
from app.modules.auth import service
from app.modules.auth.schemas import CitizenRegister, LoginRequest, MeOut, RefreshRequest, TokenPair

router = APIRouter(tags=["auth"], responses=ERROR_RESPONSES)


@router.post(
    "/auth/citizen/register",
    response_model=TokenPair,
    status_code=status.HTTP_201_CREATED,
    summary="Регистрация гражданина с согласиями",
)
def register_citizen(body: CitizenRegister, session: DbSession) -> TokenPair:
    """Создаёт пользователя, профиль гражданина и два согласия в одной транзакции.
    409 — email или телефон заняты."""
    return service.register_citizen(session, body)


@router.post("/auth/citizen/login", response_model=TokenPair, summary="Вход гражданина")
def login_citizen(body: LoginRequest, session: DbSession) -> TokenPair:
    return service.login(session, body.login, body.password, staff=False)


@router.post(
    "/auth/staff/login", response_model=TokenPair, summary="Вход диспетчера или подрядчика"
)
def login_staff(body: LoginRequest, session: DbSession) -> TokenPair:
    return service.login(session, body.login, body.password, staff=True)


@router.post("/auth/refresh", response_model=TokenPair, summary="Обновление токенов с ротацией")
def refresh(body: RefreshRequest, session: DbSession) -> TokenPair:
    """Старый refresh отзывается. Повтор отозванного — кража: отзываются все токены."""
    return service.refresh(session, body.refresh_token)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Выход")
def logout(body: RefreshRequest, user: AnyUser, session: DbSession) -> None:
    service.logout(session, user.id, body.refresh_token)


@router.get("/me", response_model=MeOut, summary="Текущий пользователь")
def me(user: AnyUser, session: DbSession) -> MeOut:
    return service.me(session, user.id)
