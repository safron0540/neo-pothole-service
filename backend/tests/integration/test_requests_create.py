"""Подача заявки и автообработка через API на PostGIS (UC-03, UC-04)."""

import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import text

from tests.integration.conftest import (
    ZONE,
    add_contractor,
    add_photo,
    add_street,
    add_user,
    login,
    point_near,
)

API = "/api/v1"
BIG = {"has_pit": True, "class": "big", "pits_count": 2, "model_version": "stub-0.1"}


@pytest.fixture
def citizen(client, session):
    user = add_user(session, "citizen")
    return {**user, "headers": login(client, user)}


def submit(client, session, citizen, lat, lon, ml=BIG, **body):
    payload = {
        "client_request_id": str(body.pop("client_request_id", uuid.uuid4())),
        "photo_id": str(body.pop("photo_id", None) or add_photo(session, citizen["id"], ml)),
        "location": {"lat": lat, "lon": lon},
        **body,
    }
    return client.post(f"{API}/requests", json=payload, headers=citizen["headers"])


def row(session, request_id):
    return session.execute(
        text(
            "SELECT status, defect_class, class_source, pits_count, street_group, address,"
            " contractor_id, duplicate_of_id, detected_at, planned_due_at FROM requests"
            " WHERE id = :id"
        ),
        {"id": request_id},
    ).one()


def test_uc_04_autoprocessing_fills_snapshot(client, session, citizen):
    add_street(session, group="Б")
    contractor_id = add_contractor(session, ZONE)
    response = submit(client, session, citizen, *point_near(session, 0.5, 10))
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == {"code": "on_review", "label": "На проверке"}
    assert body["address"] == "улица Тестовая, Тестовый район"
    assert body["photo_before_url"].startswith(f"{API}/photos/")
    assert [e["type"] for e in body["history"]] == ["created"]  # автообработку не показываем

    saved = row(session, body["id"])
    assert (saved.defect_class, saved.class_source, saved.pits_count) == ("big", "model", 2)
    assert saved.street_group == "Б" and saved.contractor_id == contractor_id
    assert saved.planned_due_at - saved.detected_at == timedelta(hours=72)
    events = session.execute(
        text("SELECT type FROM request_events WHERE request_id = :id ORDER BY id"),
        {"id": body["id"]},
    ).scalars()
    assert list(events) == ["created", "processed"]


def test_uc_03_a5_repeat_returns_same_request(client, session, citizen):
    client_request_id = uuid.uuid4()
    photo_id = add_photo(session, citizen["id"], BIG)
    first = submit(
        client,
        session,
        citizen,
        60.0,
        100.0,
        client_request_id=client_request_id,
        photo_id=photo_id,
    )
    again = submit(
        client,
        session,
        citizen,
        60.0,
        100.0,
        client_request_id=client_request_id,
        photo_id=photo_id,
    )
    assert (first.status_code, again.status_code) == (201, 200)
    assert again.json()["id"] == first.json()["id"]
    count = session.execute(
        text("SELECT count(*) FROM requests WHERE author_id = :a"), {"a": citizen["id"]}
    ).scalar_one()
    assert count == 1


def test_photo_used_twice_is_409(client, session, citizen):
    photo_id = add_photo(session, citizen["id"], BIG)
    assert submit(client, session, citizen, 60.0, 100.0, photo_id=photo_id).status_code == 201
    again = submit(client, session, citizen, 60.0, 100.0, photo_id=photo_id)
    assert again.status_code == 409 and again.json()["code"] == "photo_used"


def test_foreign_photo_is_422(client, session, citizen):
    stranger = add_user(session, "citizen")
    response = submit(
        client, session, citizen, 60.0, 100.0, photo_id=add_photo(session, stranger["id"], BIG)
    )
    assert response.status_code == 422 and response.json()["code"] == "foreign_photo"


def test_request_without_photo_rejected(client, session, citizen):
    response = submit(client, session, citizen, 60.0, 100.0, photo_id=uuid.uuid4())
    assert response.status_code == 422


def test_req_022_model_unavailable_needs_manual_class(client, session, citizen):
    no_class = submit(client, session, citizen, 60.0, 100.0, ml=None)
    assert no_class.status_code == 422 and no_class.json()["code"] == "manual_class_required"
    manual = submit(client, session, citizen, 60.0, 100.0, ml=None, manual_class="small")
    assert manual.status_code == 201
    saved = row(session, manual.json()["id"])
    assert (saved.defect_class, saved.class_source) == ("small", "citizen")


def test_no_street_means_no_group_and_no_due_date(client, session, citizen):
    response = submit(client, session, citizen, 61.0, 101.0)
    saved = row(session, response.json()["id"])
    assert saved.street_group is None and saved.planned_due_at is None and saved.address is None
    assert saved.status == "on_review"


@pytest.mark.parametrize(("meters", "duplicate"), [(14.5, True), (16, False)])
def test_req_044_duplicate_marked(client, session, citizen, meters, duplicate):
    first = submit(client, session, citizen, *point_near(session, 0.5, 0)).json()["id"]
    second = submit(client, session, citizen, *point_near(session, 0.5, meters)).json()["id"]
    assert row(session, second).duplicate_of_id == (first if duplicate else None)


def test_rule_5_snapshot_not_changed_by_reference_edit(client, session, citizen):
    street_id = add_street(session, group="Б")
    request_id = submit(client, session, citizen, *point_near(session, 0.5, 5)).json()["id"]
    session.execute(text("UPDATE streets SET street_group = 'А' WHERE id = :id"), {"id": street_id})
    assert row(session, request_id).street_group == "Б"


def test_my_requests_list_and_card(client, session, citizen):
    ids = [submit(client, session, citizen, 60.0, 100.0).json()["id"] for _ in range(3)]
    page = client.get(f"{API}/me/requests?limit=2", headers=citizen["headers"]).json()
    assert page["total"] == 3 and len(page["items"]) == 2
    assert page["items"][0]["id"] == ids[-1]  # новые сверху
    assert page["items"][0]["location"] == {"lat": 60.0, "lon": 100.0}
    card = client.get(f"{API}/me/requests/{ids[0]}", headers=citizen["headers"]).json()
    assert card["location"] == {"lat": 60.0, "lon": 100.0}
    datetime.fromisoformat(card["detected_at"])


def test_foreign_request_is_404_and_roles_checked(client, session, citizen):
    request_id = submit(client, session, citizen, 60.0, 100.0).json()["id"]
    other = login(client, add_user(session, "citizen"))
    assert client.get(f"{API}/me/requests/{request_id}", headers=other).status_code == 404
    dispatcher = login(client, add_user(session, "dispatcher"))
    assert client.get(f"{API}/me/requests", headers=dispatcher).status_code == 403
    assert client.get(f"{API}/me/requests").status_code == 401
