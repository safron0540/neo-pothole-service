"""Вход: раздельно для граждан и сотрудников (REQ-001). Реализация — PR 2-2."""

from fastapi import APIRouter, status

from app.deps import Token
from app.errors import ERROR_RESPONSES, not_implemented
from app.modules.auth.schemas import CitizenRegister, LoginRequest, MeOut, RefreshRequest, TokenPair

router = APIRouter(tags=["auth"], responses=ERROR_RESPONSES)


@router.post(
    "/auth/citizen/register",
    response_model=TokenPair,
    status_code=status.HTTP_201_CREATED,
    summary="Регистрация гражданина с согласиями",
)
def register_citizen(body: CitizenRegister) -> TokenPair:
    """Создаёт пользователя, профиль гражданина и два согласия в одной транзакции.
    409 — email или телефон заняты."""
    not_implemented()


@router.post("/auth/citizen/login", response_model=TokenPair, summary="Вход гражданина")
def login_citizen(body: LoginRequest) -> TokenPair:
    not_implemented()


@router.post(
    "/auth/staff/login", response_model=TokenPair, summary="Вход диспетчера или подрядчика"
)
def login_staff(body: LoginRequest) -> TokenPair:
    not_implemented()


@router.post("/auth/refresh", response_model=TokenPair, summary="Обновление токенов с ротацией")
def refresh(body: RefreshRequest) -> TokenPair:
    """Старый refresh отзывается. Повтор отозванного — кража: отзываются все токены."""
    not_implemented()


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Выход")
def logout(body: RefreshRequest, token: Token) -> None:
    not_implemented()


@router.get("/me", response_model=MeOut, summary="Текущий пользователь")
def me(token: Token) -> MeOut:
    not_implemented()
