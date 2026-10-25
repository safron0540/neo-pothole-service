"""Общие зависимости роутеров: сессия БД, текущий пользователь и роль, пагинация."""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_session
from app.errors import ApiError
from app.modules.auth.security import decode_access_token

# auto_error=False: без токена отвечаем 401 в общем формате ошибок, а не 403 FastAPI
bearer = HTTPBearer(auto_error=False, description="access-токен из /auth/*/login")
Token = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
DbSession = Annotated[Session, Depends(get_session)]


@dataclass(frozen=True)
class CurrentUser:
    id: int
    role: str
    contractor_id: int | None = None


def current_user(token: Token) -> CurrentUser:
    payload = decode_access_token(token.credentials) if token else None
    if payload is None:
        raise ApiError(401, "unauthorized", "Нужен вход: токен отсутствует или истёк")
    return CurrentUser(id=int(payload["sub"]), role=payload["role"], contractor_id=payload["cid"])


def require(*roles: str):
    """Зависимость «роль»: чужая роль получает 403."""

    def dependency(user: Annotated[CurrentUser, Depends(current_user)]) -> CurrentUser:
        if user.role not in roles:
            raise ApiError(403, "forbidden", "Недостаточно прав для этого действия")
        return user

    return dependency


AnyUser = Annotated[CurrentUser, Depends(current_user)]
CitizenUser = Annotated[CurrentUser, Depends(require("citizen"))]
DispatcherUser = Annotated[CurrentUser, Depends(require("dispatcher"))]
ContractorStaff = Annotated[CurrentUser, Depends(require("contractor"))]


class Pagination(BaseModel):
    limit: int
    offset: int


def pagination(
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Pagination:
    return Pagination(limit=limit, offset=offset)


Paging = Annotated[Pagination, Depends(pagination)]
