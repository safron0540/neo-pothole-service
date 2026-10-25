"""Полный цикл заявки через API (UC-03…UC-07) и проверка приложения после запуска.

Гражданин регистрируется, фотографирует яму и подаёт заявку; диспетчер указывает группу
и принимает её; подрядчик сдаёт работу с фото «после»; гражданин видит «Выполнено»,
историю и столько уведомлений, сколько было смен статуса (REQ-031).
"""

import uuid

import pytest
from sqlalchemy import text

from app.modules.media import service as media
from app.modules.ml_client.client import Prediction
from tests.images import image_bytes
from tests.integration.conftest import ZONE, add_contractor, add_user, login

API = "/api/v1"


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(media.get_settings(), "photos_dir", str(tmp_path))
    prediction = Prediction(has_pit=True, defect_class="big", pits_count=1, model_version="e2e")
    monkeypatch.setattr(media.ml_client, "predict", lambda *args, **kwargs: prediction)


def bearer(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def test_uc_03_07_full_cycle(client, session):
    # 1. Гражданин регистрируется (UC-01)
    citizen = bearer(
        client.post(
            f"{API}/auth/citizen/register",
            json={
                "email": f"{uuid.uuid4().hex[:8]}@example.com",
                "password": "Secret123",
                "first_name": "Анна",
                "last_name": "Сидорова",
                "phone": f"+7913{uuid.uuid4().int % 10**7:07d}",
                "consent_pd": True,
                "consent_geo": True,
            },
        ).json()
    )

    # 2. Фото ямы проверяет модель, заявка создаётся и обрабатывается (UC-03, UC-04)
    files = {"image": ("pit.jpg", image_bytes(1920, 1080), "image/jpeg")}
    analysis = client.post(f"{API}/photos/analyze", files=files, headers=citizen).json()
    assert analysis["defect_class"] == "big"
    contractor_id = add_contractor(session, ZONE)
    created = client.post(
        f"{API}/requests",
        json={
            "client_request_id": str(uuid.uuid4()),
            "photo_id": analysis["photo_id"],
            "location": {"lat": 60.0, "lon": 100.005},  # в зоне подрядчика, улицы рядом нет
            "citizen_comment": "Глубокая яма у остановки",
        },
        headers=citizen,
    )
    assert created.status_code == 201
    request_id = created.json()["id"]

    # 3. Диспетчер видит пометку «нужна группа», указывает её и принимает (UC-05)
    dispatcher = login(client, add_user(session, "dispatcher"))
    card = client.get(f"{API}/requests/{request_id}", headers=dispatcher).json()
    assert card["needs_group"] is True and card["contractor"]["id"] == contractor_id
    card = client.patch(
        f"{API}/requests/{request_id}/street-group",
        json={"street_group": "А", "version": card["version"]},
        headers=dispatcher,
    ).json()
    card = client.patch(
        f"{API}/requests/{request_id}/status",
        json={"to": "accepted", "version": card["version"], "comment": "Подтверждено"},
        headers=dispatcher,
    ).json()
    assert card["status"]["code"] == "in_progress"  # подрядчик уже назначен по зоне

    # 4. Подрядчик видит заявку и сдаёт работу с фото «после» (UC-06)
    worker = login(client, add_user(session, "contractor", contractor_id=contractor_id))
    own = client.get(f"{API}/contractor/requests", headers=worker).json()
    assert [item["id"] for item in own["items"]] == [request_id]
    files = {"image": ("after.jpg", image_bytes(1920, 1080, shade=200), "image/jpeg")}
    done = client.post(
        f"{API}/contractor/requests/{request_id}/complete", files=files, headers=worker
    )
    assert done.status_code == 200 and done.json()["status"]["code"] == "done"

    # 5. Гражданин видит результат, фото «после» и историю (UC-07)
    mine = client.get(f"{API}/me/requests/{request_id}", headers=citizen).json()
    assert mine["status"] == {"code": "done", "label": "Выполнено"}
    assert client.get(mine["photo_after_url"]).status_code == 200
    statuses = [e["payload"]["to"] for e in mine["history"]]
    assert statuses == ["on_review", "accepted", "in_progress", "done"]
    notes = session.execute(
        text("SELECT count(*) FROM notifications WHERE request_id = :id"), {"id": request_id}
    ).scalar_one()
    assert notes == 3  # три смены статуса — три уведомления (REQ-031, В-6)


def test_startup_check(client):
    """После запуска: живость, Swagger и схема API доступны (как проверяет деплой)."""
    assert client.get(f"{API}/health").json()["status"] == "ok"
    assert client.get("/api/docs").status_code == 200
    spec = client.get("/api/openapi.json").json()
    assert f"{API}/requests" in spec["paths"]
