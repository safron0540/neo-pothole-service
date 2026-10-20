"""Единый формат ошибок API: {code, message, details}, сообщение на русском."""

from typing import Any, NoReturn

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

# Код ошибки по HTTP-статусу, когда ошибку бросил сам фреймворк
CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    413: "payload_too_large",
    422: "validation_error",
    429: "too_many_requests",
    501: "not_implemented",
    503: "service_unavailable",
}

MESSAGES = {
    404: "Не найдено",
    405: "Метод не поддерживается",
    422: "Ошибка в данных запроса",
}


class ErrorResponse(BaseModel):
    code: str
    message: str
    details: Any = None


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: Any = None):
        self.status, self.code, self.message, self.details = status, code, message, details


def not_implemented() -> NoReturn:
    """Заглушка роутера контракта v1: запрос описан, но ещё не сделан."""
    raise ApiError(501, "not_implemented", "Запрос описан в API v1, но ещё не реализован")


def _response(status: int, code: str, message: str, details: Any = None) -> JSONResponse:
    body = ErrorResponse(code=code, message=message, details=details).model_dump()
    return JSONResponse(status_code=status, content=body)


async def _api_error(_: Request, error: ApiError) -> JSONResponse:
    return _response(error.status, error.code, error.message, error.details)


async def _http_error(_: Request, error: StarletteHTTPException) -> JSONResponse:
    code = CODES.get(error.status_code, "error")
    message = MESSAGES.get(error.status_code) or str(error.detail)
    return _response(error.status_code, code, message)


async def _validation_error(_: Request, error: RequestValidationError) -> JSONResponse:
    # В details только место и тип ошибки: присланные значения (пароли) не возвращаем
    details = [{"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in error.errors()]
    return _response(422, "validation_error", MESSAGES[422], details)


def install(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _api_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)


# Ответы, которые описываются у каждого роутера в OpenAPI
ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    status: {"model": ErrorResponse, "description": description}
    for status, description in {
        401: "Нет токена или он недействителен",
        403: "Роль не подходит",
        404: "Не найдено (чужая заявка тоже 404)",
        409: "Конфликт: version, недопустимый переход, занятое значение",
        422: "Ошибка в данных запроса",
        501: "Ещё не реализовано",
    }.items()
}
