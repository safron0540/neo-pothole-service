"""Точка входа: uvicorn app.main:app."""

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app import __version__, errors, metrics
from app.config import get_settings
from app.modules.admin.router import router as admin_router
from app.modules.auth.router import router as auth_router
from app.modules.media.router import router as media_router
from app.modules.notifications import push  # noqa: F401 — подключает отправку push после коммита
from app.modules.notifications.router import router as notifications_router
from app.modules.planned_repair.router import router as planned_repair_router
from app.modules.reports.router import router as reports_router
from app.modules.requests.router import router as requests_router

API_PREFIX = "/api/v1"

TAGS = [
    {"name": "service", "description": "Служебные запросы"},
    {"name": "auth", "description": "Регистрация, вход, токены"},
    {"name": "photos", "description": "Анализ фото до подачи заявки"},
    {"name": "citizen", "description": "Мобильное приложение гражданина"},
    {"name": "dispatcher", "description": "Веб-панель диспетчера"},
    {"name": "contractor", "description": "Рабочее место подрядчика"},
    {"name": "admin", "description": "Справочники и сотрудники (диспетчер)"},
    {"name": "reports", "description": "Отчёты, плановый ремонт, рейтинг (диспетчер)"},
]


class HealthResponse(BaseModel):
    status: str
    version: str


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=__version__,
    description="REST API сервиса «Ямочный ремонт». Время — UTC (ISO-8601 с Z), ошибки — "
    "{code, message, details}. Запросы с ответом 501 описаны в контракте v1, но ещё не сделаны.",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
    openapi_tags=TAGS,
)
errors.install(app)
metrics.install(app)
# Токен передаётся в заголовке Authorization, cookie не нужны: allow_credentials не включаем
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

router = APIRouter(prefix=API_PREFIX)


@router.get("/health", response_model=HealthResponse, tags=["service"], summary="Проверка живости")
def health() -> HealthResponse:
    """Отвечает, что API запущен. Используется деплоем и Docker HEALTHCHECK."""
    return HealthResponse(status="ok", version=__version__)


for module_router in (
    auth_router,
    media_router,
    requests_router,
    notifications_router,
    admin_router,
    reports_router,
    planned_repair_router,
):
    router.include_router(module_router)

app.include_router(router)
