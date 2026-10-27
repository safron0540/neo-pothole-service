"""CORS: браузер пускает к API только адреса веба из CORS_ORIGINS (БЗ-1)."""

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app

client = TestClient(app)
WEB = "http://127.0.0.1:5173"


def preflight(origin: str):
    return client.options(
        "/api/v1/health",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "Authorization, Content-Type",
        },
    )


def test_bz_1_web_origin_allowed():
    response = preflight(WEB)
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == WEB
    assert "PATCH" in response.headers["access-control-allow-methods"]


def test_bz_1_simple_request_gets_header():
    response = client.get("/api/v1/health", headers={"Origin": WEB})
    assert response.headers["access-control-allow-origin"] == WEB


def test_bz_1_other_origin_rejected():
    response = preflight("http://evil.example")
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_bz_1_origins_from_comma_list():
    settings = Settings(cors_origins=" https://a.ru, https://b.ru ,")
    assert settings.cors_origin_list == ["https://a.ru", "https://b.ru"]
