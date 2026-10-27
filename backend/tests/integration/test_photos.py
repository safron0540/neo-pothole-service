"""POST /photos/analyze и выдача фото по ссылке на PostGIS (ML подменяется в тесте)."""

import uuid

import pytest
from sqlalchemy import text

from app.modules.media import service
from app.modules.ml_client.client import Prediction
from tests.images import image_bytes
from tests.integration.conftest import add_user, login

API = "/api/v1"


@pytest.fixture(autouse=True)
def photos_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(service.get_settings(), "photos_dir", str(tmp_path))
    return tmp_path


def use_ml(monkeypatch, prediction: Prediction | None):
    monkeypatch.setattr(service.ml_client, "predict", lambda *args, **kwargs: prediction)


def big() -> Prediction:
    return Prediction(has_pit=True, defect_class="big", pits_count=2, model_version="stub-0.1")


def analyze(client, headers, data=None):
    files = {"image": ("pit.jpg", data or image_bytes(), "image/jpeg")}
    return client.post(f"{API}/photos/analyze", files=files, headers=headers)


@pytest.fixture
def citizen(client, session):
    return login(client, add_user(session, "citizen"))


def test_req_016_photo_with_pit_stored(client, session, citizen, monkeypatch, photos_dir):
    use_ml(monkeypatch, big())
    response = analyze(client, citizen)
    assert response.status_code == 200
    body = response.json()
    assert body["defect_class"] == "big" and body["pits_count"] == 2
    assert body["model_unavailable"] is False
    row = session.execute(
        text("SELECT path, width, model_version, ml_json->>'class' FROM photos WHERE id = :id"),
        {"id": body["photo_id"]},
    ).one()
    assert tuple(row[1:]) == (1280, "stub-0.1", "big")
    assert (photos_dir / row[0]).is_file()


def test_req_019_no_pit_is_422_and_not_stored(client, session, citizen, monkeypatch):
    use_ml(monkeypatch, Prediction(has_pit=False))
    response = analyze(client, citizen)
    assert response.status_code == 422 and response.json()["code"] == "no_pit_detected"
    assert session.execute(text("SELECT count(*) FROM photos")).scalar_one() == 0


def test_req_022_model_unavailable_photo_kept(client, citizen, monkeypatch):
    use_ml(monkeypatch, None)
    body = analyze(client, citizen).json()
    assert body["model_unavailable"] is True and body["defect_class"] is None


def test_ft_2_low_resolution_rejected(client, citizen, monkeypatch):
    use_ml(monkeypatch, big())
    response = analyze(client, citizen, image_bytes(1000, 700))
    assert response.status_code == 422 and response.json()["code"] == "low_resolution"


def test_only_citizen_analyzes(client, session, monkeypatch):
    use_ml(monkeypatch, big())
    assert analyze(client, {}).status_code == 401
    dispatcher = login(client, add_user(session, "dispatcher"))
    assert analyze(client, dispatcher).status_code == 403


def test_photo_served_by_signed_url(client, citizen, monkeypatch):
    use_ml(monkeypatch, big())
    data = image_bytes(shade=10)
    photo_id = analyze(client, citizen, data).json()["photo_id"]
    url = service.photo_url(uuid.UUID(photo_id))
    response = client.get(url)
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg" and response.content == data
    assert client.get(url.replace("sig=", "sig=0")).status_code == 403
