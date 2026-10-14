from fastapi.testclient import TestClient

from app import __version__
from app.main import app

client = TestClient(app)


def test_health_returns_ok_and_version():
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__}


def test_openapi_and_swagger_are_served():
    schema = client.get("/api/openapi.json")
    docs = client.get("/api/docs")

    assert schema.status_code == 200
    assert "/api/v1/health" in schema.json()["paths"]
    assert docs.status_code == 200
