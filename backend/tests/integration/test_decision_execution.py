"""Решение диспетчера и выполнение подрядчиком через API на PostGIS (UC-05, UC-06).

Класс и группа до решения, назначение подрядчика, «Выполнено» с фото «после»,
и матрица «запрос × роль»: каждая роль видит и меняет только своё.
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.modules.media import service as media
from tests.images import image_bytes
from tests.integration.conftest import add_contractor, add_request, add_user, login

API = "/api/v1"
DUE = datetime.now(UTC) + timedelta(hours=72)


@pytest.fixture(autouse=True)
def photos_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(media.get_settings(), "photos_dir", str(tmp_path))


@pytest.fixture
def dispatcher(client, session):
    return login(client, add_user(session, "dispatcher"))


@pytest.fixture
def worker(client, session):
    user = add_user(session, "contractor")
    return {**user, "headers": login(client, user)}


def new_request(session, **fields):
    fields.setdefault("planned_due_at", DUE)
    fields.setdefault("street_group", "Б")
    return add_request(session, 60.0, 100.0, **fields)


def call(client, headers, method, path, **kwargs):
    return client.request(method, f"{API}{path}", headers=headers, **kwargs)


def test_req_054_card_with_recommendation(client, session, dispatcher):
    request_id = new_request(session, defect_class="small")
    card = call(client, dispatcher, "GET", f"/requests/{request_id}").json()
    assert card["must_fix"] is False
    assert card["recommendation"] == {"code": "rejected", "label": "Отклонено"}
    assert card["applicant"] is None  # В-27: не в «Требует уточнения»
    assert card["photo_before_url"].startswith(f"{API}/photos/")


def test_req_056_class_change_before_decision(client, session, dispatcher):
    request_id = new_request(session, defect_class="small")
    response = call(
        client,
        dispatcher,
        "PATCH",
        f"/requests/{request_id}/class",
        json={"defect_class": "big", "version": 1},
    )
    card = response.json()
    assert card["defect_class"] == "big" and card["class_source"] == "dispatcher"
    assert card["recommendation"]["code"] == "accepted" and card["version"] == 2


def test_v_5_class_locked_after_accept(client, session, dispatcher):
    request_id = new_request(session, status="accepted")
    response = call(
        client,
        dispatcher,
        "PATCH",
        f"/requests/{request_id}/class",
        json={"defect_class": "small", "version": 1},
    )
    assert response.status_code == 409 and response.json()["code"] == "class_locked"


def test_req_057_group_change_recalculates_due(client, session, dispatcher):
    request_id = new_request(session, planned_due_at=None, street_group=None)
    card = call(
        client,
        dispatcher,
        "PATCH",
        f"/requests/{request_id}/street-group",
        json={"street_group": "А", "version": 1},
    ).json()
    detected = datetime.fromisoformat(card["detected_at"])
    due = datetime.fromisoformat(card["planned_due_at"])
    assert due - detected == timedelta(hours=24) and card["needs_group"] is False


def test_uc_05_group_then_accept(client, session, dispatcher):
    """Как в вебе: заявка без улицы — указать группу, затем принять."""
    request_id = new_request(session, planned_due_at=None, street_group=None)
    card = call(
        client,
        dispatcher,
        "PATCH",
        f"/requests/{request_id}/street-group",
        json={"street_group": "В", "version": 1},
    ).json()
    accepted = call(
        client,
        dispatcher,
        "PATCH",
        f"/requests/{request_id}/status",
        json={"to": "accepted", "version": card["version"]},
    )
    assert accepted.status_code == 200 and accepted.json()["status"]["code"] == "accepted"


def test_req_058_assign_contractor_moves_accepted_to_work(client, session, dispatcher):
    request_id = new_request(session, status="accepted")
    contractor_id = add_contractor(session)
    card = call(
        client,
        dispatcher,
        "PUT",
        f"/requests/{request_id}/contractor",
        json={"contractor_id": contractor_id, "version": 1},
    ).json()
    assert card["status"]["code"] == "in_progress"
    assert card["contractor"]["id"] == contractor_id and card["needs_contractor"] is False
    types = [
        e["type"] for e in call(client, dispatcher, "GET", f"/requests/{request_id}/events").json()
    ]
    assert types == ["contractor_changed", "status_changed"]


def test_v_7_inactive_contractor_not_assignable(client, session, dispatcher):
    request_id = new_request(session)
    response = call(
        client,
        dispatcher,
        "PUT",
        f"/requests/{request_id}/contractor",
        json={"contractor_id": add_contractor(session, is_active=False), "version": 1},
    )
    assert response.status_code == 422


def complete(client, worker, request_id, data=None):
    files = {"image": ("after.jpg", data or image_bytes(shade=200), "image/jpeg")}
    return client.post(
        f"{API}/contractor/requests/{request_id}/complete", files=files, headers=worker["headers"]
    )


def test_req_063_complete_with_after_photo(client, session, worker):
    request_id = new_request(session, status="in_progress", contractor_id=worker["contractor_id"])
    response = complete(client, worker, request_id)
    assert response.status_code == 200
    body = response.json()
    assert body["status"]["code"] == "done" and body["completed_at"]
    assert body["photo_after_url"].startswith(f"{API}/photos/")
    author_note = session.execute(
        text("SELECT body FROM notifications WHERE request_id = :id"), {"id": request_id}
    ).scalar_one()
    assert author_note == "Статус изменён: Выполнено"


def test_req_063_complete_needs_valid_photo(client, session, worker):
    request_id = new_request(session, status="in_progress", contractor_id=worker["contractor_id"])
    assert complete(client, worker, request_id, image_bytes(800, 600)).status_code == 422
    status = session.execute(
        text("SELECT status FROM requests WHERE id = :id"), {"id": request_id}
    ).scalar_one()
    assert status == "in_progress"


def test_complete_twice_is_409(client, session, worker):
    request_id = new_request(session, status="in_progress", contractor_id=worker["contractor_id"])
    assert complete(client, worker, request_id).status_code == 200
    assert complete(client, worker, request_id).status_code == 409


def test_req_061_contractor_list_and_overdue(client, session, worker):
    own = worker["contractor_id"]
    late = new_request(
        session,
        status="in_progress",
        contractor_id=own,
        planned_due_at=datetime.now(UTC) - timedelta(hours=1),
    )
    on_time = new_request(session, status="in_progress", contractor_id=own)
    new_request(session, status="in_progress", contractor_id=add_contractor(session))  # чужая
    new_request(session, status="on_review", contractor_id=own)  # ещё не решена
    page = call(client, worker["headers"], "GET", "/contractor/requests").json()
    assert [i["id"] for i in page["items"]] == [late, on_time]
    assert page["items"][0]["is_overdue"] is True
    overdue = call(client, worker["headers"], "GET", "/contractor/requests?overdue=true").json()
    assert [i["id"] for i in overdue["items"]] == [late]


def test_req_061_contractor_sees_no_applicant(client, session, worker):
    request_id = new_request(session, status="in_progress", contractor_id=worker["contractor_id"])
    card = call(client, worker["headers"], "GET", f"/contractor/requests/{request_id}").json()
    assert "applicant" not in card and "citizen_comment" not in card


def test_foreign_contractor_request_is_404(client, session, worker):
    request_id = new_request(session, status="in_progress", contractor_id=add_contractor(session))
    assert (
        call(client, worker["headers"], "GET", f"/contractor/requests/{request_id}").status_code
        == 404
    )
    assert complete(client, worker, request_id).status_code == 404


# --- Матрица «запрос × роль» (docs/architecture.md, раздел 10.1) -------------------------

DISPATCHER_ONLY = [
    ("GET", "/requests/{id}", None),
    ("GET", "/requests/{id}/events", None),
    ("PATCH", "/requests/{id}/status", {"to": "needs_clarification", "version": 1}),
    ("PATCH", "/requests/{id}/class", {"defect_class": "small", "version": 1}),
    ("PATCH", "/requests/{id}/street-group", {"street_group": "А", "version": 1}),
]
CONTRACTOR_ONLY = [
    ("GET", "/contractor/requests", None),
    ("GET", "/contractor/requests/{id}", None),
]
CITIZEN_ONLY = [("GET", "/me/requests", None), ("GET", "/me/requests/{id}", None)]


@pytest.mark.parametrize("role", ["citizen", "dispatcher", "contractor"])
def test_req_012_role_matrix(client, session, role):
    user = add_user(session, role)
    headers = login(client, user)
    fields = {}
    if role == "citizen":
        fields = {"author_id": user["id"]}
    if role == "contractor":
        fields = {"contractor_id": user["contractor_id"], "status": "in_progress"}
    groups = {"dispatcher": DISPATCHER_ONLY, "contractor": CONTRACTOR_ONLY, "citizen": CITIZEN_ONLY}
    for owner, operations in groups.items():
        for method, path, body in operations:
            url = path.format(id=new_request(session, **fields))  # своя заявка на каждый запрос
            response = call(client, headers, method, url, json=body)
            expected = 200 if role == owner else 403
            assert response.status_code == expected, (role, method, path, response.text)
            assert call(client, {}, method, url, json=body).status_code == 401
