"""Настоящая модель: формат ответа, который ждёт бэкенд (В-34), и ошибки входа."""

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from inference.main import MODEL_PATH, app


@pytest.fixture(scope="module")
def client():
    # with — чтобы сработал lifespan и модель загрузилась
    with TestClient(app) as test_client:
        yield test_client


def jpeg(color=(90, 90, 90), size=(1280, 720)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "JPEG")
    return buf.getvalue()


def test_model_file_exists():
    assert MODEL_PATH.is_file()


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


def test_predict_format(client):
    response = client.post("/predict", files={"image": ("pit.jpg", jpeg(), "image/jpeg")})
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"has_pit", "class", "pits_count", "confidence", "model_version"}
    assert 0 <= body["confidence"] <= 1
    if body["has_pit"]:
        assert body["class"] in ("big", "small") and body["pits_count"] >= 1
    else:
        assert body["class"] is None and body["pits_count"] == 0


def test_png_works(client):
    buf = io.BytesIO()
    Image.new("RGB", (1280, 720), (40, 40, 40)).save(buf, "PNG")
    response = client.post("/predict", files={"image": ("pit.png", buf.getvalue(), "image/png")})
    assert response.status_code == 200, response.text


def test_empty_file_is_422(client):
    response = client.post("/predict", files={"image": ("pit.jpg", b"", "image/jpeg")})
    assert response.status_code == 422


def test_not_an_image_is_422(client):
    response = client.post("/predict", files={"image": ("pit.jpg", b"not a photo", "image/jpeg")})
    assert response.status_code == 422
