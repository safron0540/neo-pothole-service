import pytest
import httpx

def test_full_stack_health(client, ml_client):
    # проверка здоровья сервисов
    r1 = client.get("/api/v1/health")
    assert r1.status_code == 200
    assert r1.json().get("status") == "ok"

    r2 = ml_client.get("/health")
    assert r2.status_code == 200
    assert r2.json().get("status") == "ok"

def test_backend_ml_contract_match(client, ml_client):
    # проверка контракта связки
    r1 = client.get("/api/openapi.json")
    assert r1.status_code == 200
    d = r1.json()

    # наличие анализа фото
    paths = d.get("paths", {})
    assert "/api/v1/photos/analyze" in paths
