"""Рейтинг и история подрядчика (REQ-065, 066, В-17): в срок — completed_at ≤ planned_due_at."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from tests.integration.conftest import add_contractor, add_photo, add_request, add_user, login

API = "/api/v1"
NOW = datetime.now(UTC)


@pytest.fixture
def dispatcher(client, session):
    return login(client, add_user(session, "dispatcher"))


@pytest.fixture
def district(session) -> int:
    return session.execute(
        text("INSERT INTO districts (name) VALUES (:n) RETURNING id"),
        {"n": f"Район {uuid.uuid4().hex[:8]}"},
    ).scalar_one()


def finished(session, district, contractor, hours: float, due_in: float, work_hours: float) -> int:
    """Заявка подана hours часов назад, срок due_in часов, в работе work_hours часов."""
    detected = NOW - timedelta(hours=hours)
    request_id = add_request(
        session,
        60.0,
        100.0,
        district_id=district,
        contractor_id=contractor,
        street_group="Б",
        detected_at=detected,
        planned_due_at=detected + timedelta(hours=due_in),
        status="in_progress",
    )
    author = session.execute(
        text("SELECT author_id FROM requests WHERE id = :id"), {"id": request_id}
    ).scalar_one()
    session.execute(
        text(
            "INSERT INTO request_events (request_id, type, payload, created_at) VALUES"
            " (:id, 'status_changed', '{\"to\": \"in_progress\"}', :t)"
        ),
        {"id": request_id, "t": NOW - timedelta(hours=work_hours)},
    )
    session.execute(
        text(
            "UPDATE requests SET status = 'done', completed_at = :c, after_photo_id = :p"
            " WHERE id = :id"
        ),
        {"c": NOW, "p": add_photo(session, author), "id": request_id},
    )
    return request_id


def rating(client, headers, district):
    response = client.get(
        f"{API}/contractors/rating", params={"district_id": district}, headers=headers
    )
    assert response.status_code == 200, response.text
    return {row["contractor"]["id"]: row for row in response.json()}


def test_req_066_rating_order_and_numbers(client, session, dispatcher, district):
    good, bad = add_contractor(session), add_contractor(session)
    finished(session, district, good, hours=20, due_in=72, work_hours=10)
    finished(session, district, good, hours=40, due_in=72, work_hours=30)
    finished(session, district, bad, hours=100, due_in=72, work_hours=50)  # опоздал
    add_request(
        session,
        60.0,
        100.0,
        district_id=district,
        contractor_id=bad,
        status="in_progress",
        street_group="Б",
        planned_due_at=NOW - timedelta(hours=1),
    )
    rows = rating(client, dispatcher, district)
    assert rows[good]["place"] < rows[bad]["place"]
    g = rows[good]
    assert (g["done"], g["done_on_time"], g["on_time_share"]) == (2, 2, 1.0)
    assert g["avg_hours"] == pytest.approx(30, abs=0.2)
    assert g["avg_work_hours"] == pytest.approx(20, abs=0.2)  # В-17 б: от «В работе»
    b = rows[bad]
    assert (b["done"], b["done_on_time"], b["in_progress"], b["overdue_now"]) == (1, 0, 1, 1)


def test_contractor_without_requests_is_listed_last(client, session, dispatcher, district):
    busy, idle = add_contractor(session), add_contractor(session)
    finished(session, district, busy, hours=5, due_in=24, work_hours=2)
    rows = rating(client, dispatcher, district)
    assert rows[idle]["done"] == 0 and rows[idle]["on_time_share"] is None
    assert rows[idle]["place"] > rows[busy]["place"]


def test_req_065_contractor_history(client, session, dispatcher, district):
    contractor = add_contractor(session)
    old = finished(session, district, contractor, hours=100, due_in=72, work_hours=50)
    fresh = add_request(
        session,
        60.0,
        100.0,
        district_id=district,
        contractor_id=contractor,
        status="in_progress",
        street_group="Б",
        planned_due_at=NOW + timedelta(hours=10),
    )
    page = client.get(f"{API}/contractors/{contractor}/history", headers=dispatcher).json()
    assert [r["id"] for r in page["items"]] == [fresh, old] and page["total"] == 2
    done_row = page["items"][1]
    assert done_row["on_time"] is False and done_row["hours"] == pytest.approx(100, abs=0.2)
    assert page["items"][0]["on_time"] is None
    assert client.get(f"{API}/contractors/{10**12}/history", headers=dispatcher).status_code == 404


def test_rating_only_for_dispatcher(client, session):
    headers = login(client, add_user(session, "contractor"))
    assert client.get(f"{API}/contractors/rating", headers=headers).status_code == 403
