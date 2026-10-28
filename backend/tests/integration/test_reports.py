"""Отчёты: количество и среднее время по районам, подрядчикам, группам (REQ-067, 068, 070)."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from tests.integration.conftest import add_contractor, add_photo, add_request, add_user, login

API = "/api/v1"
NOW = datetime.now(UTC)
HOUR = timedelta(hours=1)


@pytest.fixture
def dispatcher(client, session):
    return login(client, add_user(session, "dispatcher"))


@pytest.fixture
def district(session) -> int:
    return session.execute(
        text("INSERT INTO districts (name) VALUES (:n) RETURNING id"),
        {"n": f"Район {uuid.uuid4().hex[:8]}"},
    ).scalar_one()


def done(session, district, contractor, hours: float, due_in: float, **fields) -> int:
    """Выполненная заявка: подана hours часов назад, срок через due_in часов от подачи."""
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
        **fields,
    )
    author = session.execute(
        text("SELECT author_id FROM requests WHERE id = :id"), {"id": request_id}
    ).scalar_one()
    session.execute(
        text(
            "UPDATE requests SET status = 'done', completed_at = :c, after_photo_id = :p"
            " WHERE id = :id"
        ),
        {"c": NOW, "p": add_photo(session, author), "id": request_id},
    )
    return request_id


def report(client, headers, path, **params):
    response = client.get(f"{API}/reports/{path}", params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_req_067_count_by_district(client, session, dispatcher, district):
    contractor = add_contractor(session)
    done(session, district, contractor, hours=10, due_in=72)  # в срок
    done(session, district, contractor, hours=100, due_in=72)  # с опозданием
    add_request(session, 60.0, 100.0, district_id=district)  # на проверке
    add_request(
        session,
        60.0,
        100.0,
        district_id=district,
        contractor_id=contractor,
        status="in_progress",
        street_group="Б",
        planned_due_at=NOW - HOUR,
    )  # просрочена сейчас
    body = report(client, dispatcher, "count", district_id=district)
    assert body["group_by"] == "district" and body["total"] == 4
    row = body["rows"][0]
    assert row["key"]["id"] == district
    assert (row["total"], row["done"], row["done_on_time"], row["overdue"]) == (4, 2, 1, 1)
    assert row["by_status"]["on_review"] == 1 and row["by_status"]["rejected"] == 0


def test_req_067_report_equals_list(client, session, dispatcher, district):
    for status in ("on_review", "rejected", "needs_clarification"):
        add_request(session, 60.0, 100.0, district_id=district, status=status)
    main = add_request(session, 60.0, 100.0, district_id=district, duplicates_count=1)
    add_request(session, 60.0, 100.0, district_id=district, merged_into_id=main)  # В-18
    params = {"district_id": district, "status": ["on_review", "needs_clarification"]}
    listed = client.get(f"{API}/requests", params=params, headers=dispatcher).json()["total"]
    on_map = len(
        client.get(
            f"{API}/map/points", params={**params, "bbox": "99,59,101,61"}, headers=dispatcher
        ).json()
    )
    counted = report(client, dispatcher, "count", **params)["total"]
    assert listed == on_map == counted == 3


def test_req_070_group_by_contractor_and_street_group(client, session, dispatcher, district):
    first, second = add_contractor(session), add_contractor(session)
    done(session, district, first, hours=5, due_in=24)
    done(session, district, first, hours=6, due_in=24)
    done(session, district, second, hours=7, due_in=24)
    by_contractor = report(client, dispatcher, "count", district_id=district, group_by="contractor")
    totals = {r["key"]["id"]: r["total"] for r in by_contractor["rows"]}
    assert totals == {first: 2, second: 1}
    assert by_contractor["rows"][0]["key"]["id"] == first  # больше заявок — выше
    by_group = report(client, dispatcher, "count", district_id=district, group_by="street_group")
    assert [(r["key"]["id"], r["key"]["name"]) for r in by_group["rows"]] == [(None, "Б")]


def test_no_value_bucket_last(client, session, dispatcher, district):
    add_request(session, 60.0, 100.0, district_id=district)  # без подрядчика
    add_request(session, 60.0, 100.0, district_id=district, contractor_id=add_contractor(session))
    rows = report(client, dispatcher, "count", district_id=district, group_by="contractor")["rows"]
    assert rows[-1]["key"] == {"id": None, "name": "Не указан"}


def test_req_068_avg_time(client, session, dispatcher, district):
    contractor = add_contractor(session)
    done(session, district, contractor, hours=10, due_in=24)
    done(session, district, contractor, hours=30, due_in=24)
    add_request(session, 60.0, 100.0, district_id=district)  # не выполнена — не считается
    rows = report(client, dispatcher, "avg-time", district_id=district)["rows"]
    assert len(rows) == 1
    row = rows[0]
    assert row["done"] == 2 and row["avg_hours"] == pytest.approx(20, abs=0.2)
    assert (row["min_hours"], row["max_hours"]) == (
        pytest.approx(10, abs=0.2),
        pytest.approx(30, abs=0.2),
    )
    assert row["on_time_share"] == 0.5


def test_reports_only_for_dispatcher(client, session):
    headers = login(client, add_user(session, "contractor"))
    assert client.get(f"{API}/reports/count", headers=headers).status_code == 403
    assert client.get(f"{API}/reports/avg-time").status_code == 401
