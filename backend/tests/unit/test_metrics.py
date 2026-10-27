"""Метрики для Prometheus (СВ-8): маршрут шаблоном, а не настоящим путём."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_metrics_count_requests_by_route_template():
    client.get("/api/v1/health")
    client.get("/api/v1/requests/123")  # без токена 401, но маршрут известен
    body = client.get("/metrics").text
    assert 'api_requests_total{method="GET",route="/api/v1/health",status="200"}' in body
    assert 'route="/api/v1/requests/{request_id}",status="401"' in body
    assert "/api/v1/requests/123" not in body
    assert 'api_request_seconds_bucket{le="1.0",method="GET",route="/api/v1/health"}' in body


def test_metrics_not_in_openapi():
    assert "/metrics" not in client.get("/api/openapi.json").json()["paths"]
