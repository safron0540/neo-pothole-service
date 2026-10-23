"""Точка входа: uvicorn app.main:app."""

from fastapi import APIRouter, FastAPI
from pydantic import BaseModel

from app import __version__
from app.config import get_settings

API_PREFIX = "/api/v1"


class HealthResponse(BaseModel):
    status: str
    version: str


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=__version__,
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

router = APIRouter(prefix=API_PREFIX)


@router.get("/health", response_model=HealthResponse, tags=["service"], summary="Проверка живости")
def health() -> HealthResponse:
    """Отвечает, что API запущен. Используется деплоем и Docker HEALTHCHECK."""
    return HealthResponse(status="ok", version=__version__)


app.include_router(router)
