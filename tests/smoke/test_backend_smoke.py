import time
import pytest
import httpx

def test_health(client):
    # проверка health
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    d = r.json()
    assert d.get("status") == "ok"
    assert "version" in d

def test_response_time(client):
    # проверка времени
    t1 = time.time()
    r = client.get("/api/v1/health")
    t2 = time.time()
    assert r.status_code == 200
    assert (t2 - t1) < 1.0

def test_openapi_schema(client):
    # проверка openapi
    r = client.get("/api/openapi.json")
    assert r.status_code == 200
    d = r.json()
    assert "openapi" in d
    assert "paths" in d
    assert "/api/v1/health" in d["paths"]

def test_swagger_ui(client):
    # проверка docs
    r = client.get("/api/docs")
    assert r.status_code == 200
    assert "html" in r.headers.get("content-type", "")

def test_not_found_format(client):
    # проверка 404
    r = client.get("/api/v1/not_existing_endpoint_xyz")
    assert r.status_code == 404
    d = r.json()
    assert "code" in d
    assert "message" in d
