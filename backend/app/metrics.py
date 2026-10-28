"""Метрики для Prometheus (фаза 6-2, СВ-8): число и время запросов API по маршрутам.

Маршрут берётся шаблоном (/api/v1/requests/{request_id}), а не настоящим путём, иначе
каждая заявка стала бы отдельным рядом. /metrics снаружи закрыт nginx, его читает только
Prometheus внутри сети compose.
"""

import time

from fastapi import FastAPI, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

REQUESTS = Counter("api_requests_total", "Запросы к API", ["method", "route", "status"])
LATENCY = Histogram(
    "api_request_seconds",
    "Время ответа API",
    ["method", "route"],
    # Границы под ПР-1, ПР-2 и ПР-6: 1 с, 2 с, 4 с
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 30),
)


def route_template(request: Request) -> str | None:
    """/api/v1/requests/123 → /api/v1/requests/{request_id}; неизвестный путь — None."""
    if request.scope.get("route") is None:
        return None
    path = request.url.path
    for name, value in request.path_params.items():
        path = path.replace(f"/{value}", f"/{{{name}}}", 1)
    return path


def install(app: FastAPI) -> None:
    @app.middleware("http")
    async def measure(request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        path = route_template(request)
        if path and path != "/metrics":
            LATENCY.labels(request.method, path).observe(time.perf_counter() - started)
            REQUESTS.labels(request.method, path, str(response.status_code)).inc()
        return response

    @app.get("/metrics", include_in_schema=False)
    def metrics() -> Response:
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
