"""Фото и ML без базы: проверка файла, подпись ссылки, ответы ML-сервиса."""

import uuid
from datetime import UTC, datetime, timedelta

import httpx2
import pytest

from app.errors import ApiError
from app.modules.media import service
from app.modules.ml_client import client as ml_client
from tests.images import image_bytes


def test_ft_2_jpeg_and_png_accepted():
    assert service.check_image(image_bytes()).mime_type == "image/jpeg"
    png = service.check_image(image_bytes(720, 1280, "PNG"))
    assert (png.mime_type, png.extension, png.width, png.height) == ("image/png", "png", 720, 1280)


@pytest.mark.parametrize(
    ("data", "status", "code"),
    [
        (b"not an image", 422, "invalid_image"),
        (image_bytes(fmt="GIF"), 422, "invalid_image"),
        (image_bytes(1279, 720), 422, "low_resolution"),
    ],
    ids=["garbage", "gif", "small"],
)
def test_ft_2_bad_photo_rejected(data, status, code):
    with pytest.raises(ApiError) as error:
        service.check_image(data)
    assert (error.value.status, error.value.code) == (status, code)


def test_v_21_photo_over_limit_is_413(monkeypatch):
    monkeypatch.setattr(service.get_settings(), "photo_max_bytes", 100)
    with pytest.raises(ApiError) as error:
        service.check_image(image_bytes())
    assert error.value.status == 413


def parse_url(url: str) -> tuple[uuid.UUID, int, str]:
    path, query = url.split("?")
    params = dict(part.split("=") for part in query.split("&"))
    return uuid.UUID(path.rsplit("/", 1)[1]), int(params["exp"]), params["sig"]


def test_photo_url_signed_for_15_minutes():
    now = datetime.now(UTC)
    photo_id, exp, sig = parse_url(service.photo_url(uuid.uuid4(), now))
    assert exp == int((now + timedelta(minutes=15)).timestamp())
    assert sig == service._signature(photo_id, exp)
    assert service.photo_url(None) is None


@pytest.mark.parametrize("tamper", ["sig", "exp", "expired"])
def test_photo_bad_signature_is_403(tamper):
    now = datetime.now(UTC) - timedelta(minutes=20) if tamper == "expired" else None
    photo_id, exp, sig = parse_url(service.photo_url(uuid.uuid4(), now))
    if tamper == "sig":
        sig = "0" * 32
    if tamper == "exp":
        exp += 3600
    with pytest.raises(ApiError) as error:
        service.photo_file(None, photo_id, exp, sig)
    assert error.value.status == 403


def ml(handler) -> httpx2.Client:
    return httpx2.Client(transport=httpx2.MockTransport(handler))


def test_v_34_ml_prediction_parsed():
    answer = {
        "has_pit": True,
        "class": "big",
        "pits_count": 2,
        "confidence": 0.8,
        "model_version": "stub-0.1",
    }
    prediction = ml_client.predict(
        b"x", "a.jpg", "image/jpeg", ml(lambda r: httpx2.Response(200, json=answer))
    )
    assert (prediction.defect_class, prediction.pits_count) == ("big", 2)


@pytest.mark.parametrize(
    "handler",
    [
        lambda r: httpx2.Response(503, json={"detail": "down"}),
        lambda r: httpx2.Response(200, text="not json"),
        lambda r: httpx2.Response(200, json={"has_pit": True, "class": None}),
    ],
)
def test_req_022_ml_errors_mean_unavailable(handler):
    assert ml_client.predict(b"x", "a.jpg", "image/jpeg", ml(handler)) is None


def test_req_022_ml_timeout_means_unavailable():
    def timeout(request):
        raise httpx2.ReadTimeout("slow", request=request)

    assert ml_client.predict(b"x", "a.jpg", "image/jpeg", ml(timeout)) is None
