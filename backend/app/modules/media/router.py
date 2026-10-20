"""Приём фото «до» и проверка моделью. Реализация — PR 2-3."""

from typing import Annotated

from fastapi import APIRouter, File, UploadFile

from app.deps import Token
from app.errors import ERROR_RESPONSES, ErrorResponse, not_implemented
from app.modules.media.schemas import PhotoAnalysis

router = APIRouter(tags=["photos"], responses=ERROR_RESPONSES)


@router.post(
    "/photos/analyze",
    response_model=PhotoAnalysis,
    summary="Проверка фото ямы моделью (гражданин)",
    responses={413: {"model": ErrorResponse, "description": "Файл больше 10 МБ"}},
)
def analyze_photo(
    image: Annotated[UploadFile, File(description="JPEG или PNG, не меньше 1280×720")],
    token: Token,
) -> PhotoAnalysis:
    """422: формат или разрешение не подходят, либо code = no_pit_detected («переснимите»)."""
    not_implemented()
