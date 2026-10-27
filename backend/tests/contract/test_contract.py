"""Контракт API v1 (тест-план: 4 контрактных теста). Работают без базы данных.

1) OpenAPI: все запросы MVP на месте и docs/openapi.json не отстал от кода;
2) формат ошибок {code, message, details};
3) время в UTC с Z;
4) версия API.
"""

from datetime import UTC, datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app import __version__
from app.main import app
from app.modules.notifications.schemas import NotificationOut
from app.schemas import StatusOut, to_utc_z
from scripts.export_openapi import OPENAPI_PATH, render

client = TestClient(app)
SPEC = app.openapi()

# Раздел 10.3 docs/architecture.md, этап MVP: (метод, путь)
MVP = {
    ("post", "/auth/citizen/register"),
    ("post", "/auth/citizen/login"),
    ("post", "/auth/staff/login"),
    ("post", "/auth/refresh"),
    ("post", "/auth/logout"),
    ("get", "/me"),
    ("post", "/photos/analyze"),
    ("post", "/requests"),
    ("get", "/me/requests"),
    ("get", "/me/requests/{request_id}"),
    ("get", "/me/notifications"),
    ("post", "/me/notifications/read"),
    ("put", "/me/device-token"),
    ("get", "/requests"),
    ("get", "/requests/{request_id}"),
    ("get", "/requests/{request_id}/events"),
    ("patch", "/requests/{request_id}/status"),
    ("patch", "/requests/{request_id}/class"),
    ("patch", "/requests/{request_id}/street-group"),
    ("put", "/requests/{request_id}/contractor"),
    ("post", "/requests/{request_id}/merge"),
    ("delete", "/requests/{request_id}/duplicate-flag"),
    ("get", "/requests/{request_id}/notes"),
    ("post", "/requests/{request_id}/notes"),
    ("get", "/map/points"),
    ("get", "/contractor/requests"),
    ("get", "/contractor/requests/{request_id}"),
    ("post", "/contractor/requests/{request_id}/complete"),
    ("get", "/districts"),
    ("post", "/districts"),
    ("patch", "/districts/{district_id}"),
    ("delete", "/districts/{district_id}"),
    ("get", "/street-groups"),
    ("put", "/street-groups/{code}"),
    ("get", "/streets"),
    ("post", "/streets"),
    ("patch", "/streets/{street_id}"),
    ("delete", "/streets/{street_id}"),
    ("get", "/contractors"),
    ("post", "/contractors"),
    ("patch", "/contractors/{contractor_id}"),
    ("delete", "/contractors/{contractor_id}"),
    ("get", "/users"),
    ("post", "/users"),
    ("patch", "/users/{user_id}"),
    ("post", "/users/{user_id}/reset-password"),
}
# Фото по подписанной ссылке: подпись заменяет токен
PUBLIC = {
    "/health",
    "/auth/citizen/register",
    "/auth/citizen/login",
    "/auth/staff/login",
    "/photos/{photo_id}",
}


def operations():
    for path, methods in SPEC["paths"].items():
        for method, operation in methods.items():
            yield method, path.removeprefix("/api/v1"), operation


# 1. OpenAPI


def test_openapi_has_all_mvp_operations():
    present = {(method, path) for method, path, _ in operations()}
    assert MVP <= present, sorted(MVP - present)
    assert all(path.startswith("/api/v1/") for path in SPEC["paths"])


def test_openapi_operation_ids_unique_and_bearer_documented():
    ids = [op["operationId"] for _, _, op in operations()]
    assert len(ids) == len(set(ids))
    for method, path, op in operations():
        if path not in PUBLIC and path != "/auth/refresh":
            assert op.get("security") == [{"HTTPBearer": []}], (method, path)


def test_docs_openapi_json_up_to_date():
    assert OPENAPI_PATH.read_text(encoding="utf-8") == render(), (
        "docs/openapi.json отстал от кода: python -m scripts.export_openapi"
    )


# 2. Формат ошибок


def assert_error(response, status: int, code: str):
    assert response.status_code == status
    body = response.json()
    assert set(body) == {"code", "message", "details"}
    assert body["code"] == code and body["message"]
    return body


def test_error_format_not_found_and_method():
    assert_error(client.get("/api/v1/nope"), 404, "not_found")
    assert_error(client.delete("/api/v1/health"), 405, "method_not_allowed")


def test_error_format_validation_hides_input():
    body = assert_error(
        client.post("/api/v1/auth/citizen/login", json={"login": "x", "password": 123}),
        422,
        "validation_error",
    )
    assert body["details"][0]["loc"] == ["body", "password"]
    assert "input" not in body["details"][0]  # присланные значения не возвращаем


def test_error_format_not_implemented_stub():
    # Уведомления появятся в PR 3-3, до этого запрос отвечает 501
    assert_error(client.get("/api/v1/me/notifications"), 501, "not_implemented")


def test_error_schema_documented_instead_of_default_422():
    for _, _, op in operations():
        for status in ("422", "501"):
            if status in op["responses"]:
                schema = op["responses"][status]["content"]["application/json"]["schema"]
                assert schema == {"$ref": "#/components/schemas/ErrorResponse"}
    assert "HTTPValidationError" not in SPEC["components"]["schemas"]


# 3. Время


def test_time_is_utc_with_z():
    tomsk = timezone(timedelta(hours=7))
    assert to_utc_z(datetime(2026, 10, 21, 15, 30, tzinfo=tomsk)) == "2026-10-21T08:30:00Z"
    assert to_utc_z(datetime(2026, 10, 21, 8, 30)) == "2026-10-21T08:30:00Z"
    note = NotificationOut(
        id=1,
        request_id=2,
        title="Заявка № 2",
        body="Статус изменён: В работе",
        is_read=False,
        created_at=datetime(2026, 10, 21, 8, 30, 15, tzinfo=UTC),
    )
    assert '"created_at":"2026-10-21T08:30:15Z"' in note.model_dump_json()


def test_status_is_code_and_label():
    assert StatusOut.of("in_progress").model_dump() == {"code": "in_progress", "label": "В работе"}


# 4. Версия API


def test_api_version():
    assert SPEC["info"]["version"] == __version__
    assert client.get("/api/v1/health").json() == {"status": "ok", "version": __version__}
    assert SPEC["openapi"].startswith("3.")
