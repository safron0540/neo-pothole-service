"""Приём фото «до» с проверкой моделью и выдача фото по подписанной ссылке."""

import uuid
from typing import Annotated

from fastapi import APIRouter, File, Query, UploadFile
from fastapi.responses import FileResponse

from app.config import get_settings
from app.deps import CitizenUser, DbSession
from app.errors import ERROR_RESPONSES, ErrorResponse
from app.modules.media import service
from app.modules.media.schemas import PhotoAnalysis

router = APIRouter(tags=["photos"], responses=ERROR_RESPONSES)


def read_limited(image: UploadFile) -> bytes:
    """Читаем не больше лимита + 1 байт: этого хватает, чтобы ответить 413."""
    return image.file.read(get_settings().photo_max_bytes + 1)


@router.post(
    "/photos/analyze",
    response_model=PhotoAnalysis,
    summary="Проверка фото ямы моделью (гражданин)",
    responses={413: {"model": ErrorResponse, "description": "Файл больше 10 МБ"}},
)
def analyze_photo(
    image: Annotated[UploadFile, File(description="JPEG или PNG, не меньше 1280×720")],
    user: CitizenUser,
    session: DbSession,
) -> PhotoAnalysis:
    """422: формат или разрешение не подходят, либо code = no_pit_detected («переснимите»)."""
    return service.analyze(session, user.id, read_limited(image), image.filename or "")


@router.get(
    "/photos/{photo_id}",
    response_class=FileResponse,
    summary="Фото по подписанной ссылке",
    responses={200: {"content": {"image/jpeg": {}, "image/png": {}}}},
)
def get_photo(
    photo_id: uuid.UUID,
    exp: Annotated[int, Query(description="срок ссылки, Unix-время")],
    sig: Annotated[str, Query(description="подпись HMAC")],
    session: DbSession,
) -> FileResponse:
    """Ссылки приходят в ответах о заявке (photo_before_url, photo_after_url) и живут 15 минут.
    Неверная или устаревшая подпись — 403."""
    path, mime_type = service.photo_file(session, photo_id, exp, sig)
    return FileResponse(path, media_type=mime_type)
