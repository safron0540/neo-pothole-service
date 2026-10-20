"""Общие зависимости роутеров: токен и пагинация."""

from typing import Annotated

from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

# auto_error=False: проверку токена и роли сделает модуль auth (PR 2-2),
# а пока схема Bearer только описывается в OpenAPI
bearer = HTTPBearer(auto_error=False, description="access-токен из /auth/*/login")
Token = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]


class Pagination(BaseModel):
    limit: int
    offset: int


def pagination(
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Pagination:
    return Pagination(limit=limit, offset=offset)


Paging = Annotated[Pagination, Depends(pagination)]
