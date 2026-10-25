"""Заглушка ML: формат ответа (В-34) и режимы для проверки бэкенда."""

import pytest
from fastapi.testclient import TestClient

from stub.main import app

client = TestClient(app)
PHOTO = b"\xff\xd8\xff fake jpeg bytes"


def post(data: bytes = PHOTO):
    return client.post("/predict", files={"image": ("pit.jpg", data, "image/jpeg")})


def test_health():
    assert client.get("/health").json() == {"status": "ok", "model_version": "stub-0.1"}


def test_response_format(monkeypatch):
    monkeypatch.setenv("ML_STUB_MODE", "big")
    body = post().json()
    assert set(body) == {"has_pit", "class", "pits_count", "confidence", "model_version"}
    assert body["has_pit"] is True and body["class"] == "big"
    assert body["pits_count"] >= 1 and 0 <= body["confidence"] <= 1


@pytest.mark.parametrize(
    ("mode", "has_pit", "defect_class"), [("small", True, "small"), ("no_pit", False, None)]
)
def test_fixed_modes(monkeypatch, mode, has_pit, defect_class):
    monkeypatch.setenv("ML_STUB_MODE", mode)
    body = post().json()
    assert (body["has_pit"], body["class"]) == (has_pit, defect_class)


def test_random_mode_same_photo_same_answer(monkeypatch):
    monkeypatch.setenv("ML_STUB_MODE", "random")
    answers = {str(post(bytes([i]) * 64).json()) for i in range(40)}
    assert post(b"photo-1").json() == post(b"photo-1").json()
    assert len(answers) > 1  # разные фото дают разные ответы


def test_unavailable_mode(monkeypatch):
    monkeypatch.setenv("ML_STUB_MODE", "unavailable")
    assert post().status_code == 503


def test_slow_mode_waits(monkeypatch):
    monkeypatch.setenv("ML_STUB_MODE", "slow")
    monkeypatch.setenv("ML_STUB_DELAY", "0.01")
    assert post().json()["class"] == "big"


def test_empty_file_rejected():
    assert post(b"").status_code == 422
