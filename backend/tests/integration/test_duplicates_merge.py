"""Слияние дубликатов и снятие пометки (REQ-044, 059): глубина 1, статус следует за основной."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from tests.integration.conftest import add_contractor, add_request, add_user, login

API = "/api/v1"
DUE = datetime.now(UTC) + timedelta(hours=72)


@pytest.fixture
def dispatcher(client, session):
    return login(client, add_user(session, "dispatcher"))


def new(session, **fields) -> int:
    fields.setdefault("street_group", "Б")
    fields.setdefault("planned_due_at", DUE)
    return add_request(session, 60.0, 100.0, **fields)


def row(session, request_id):
    return session.execute(
        text(
            "SELECT status, merged_into_id, duplicate_of_id, duplicates_count, version"
            " FROM requests WHERE id = :id"
        ),
        {"id": request_id},
    ).one()


def merge(client, headers, request_id, into_id, version=1):
    return client.post(
        f"{API}/requests/{request_id}/merge",
        json={"into_id": into_id, "version": version},
        headers=headers,
    )


def test_req_059_merge_marks_and_counts(client, session, dispatcher):
    main = new(session)
    duplicate = new(session, duplicate_of_id=main)
    response = merge(client, dispatcher, duplicate, main)
    assert response.status_code == 200, response.text
    assert response.json()["merged_into_id"] == main
    assert row(session, duplicate).merged_into_id == main
    assert row(session, duplicate).duplicate_of_id is None
    assert row(session, main).duplicates_count == 1
    events = client.get(f"{API}/requests/{duplicate}/events", headers=dispatcher).json()
    assert "merged" in [e["type"] for e in events]


def test_req_059_merged_follows_main_status(client, session, dispatcher):
    main = new(session, contractor_id=add_contractor(session))
    duplicate = new(session)
    merge(client, dispatcher, duplicate, main)
    client.patch(
        f"{API}/requests/{main}/status", json={"to": "accepted", "version": 2}, headers=dispatcher
    )
    assert row(session, main).status == "in_progress"
    assert row(session, duplicate).status == "in_progress"
    # Автор дубликата тоже узнаёт о каждой смене статуса (REQ-031)
    bodies = session.execute(
        text("SELECT body FROM notifications WHERE request_id = :id ORDER BY id"),
        {"id": duplicate},
    ).scalars()
    assert list(bodies) == ["Статус изменён: Принято", "Статус изменён: В работе"]


def test_merge_into_accepted_main_copies_status(client, session, dispatcher):
    main = new(session, status="accepted")
    duplicate = new(session)
    merge(client, dispatcher, duplicate, main)
    assert row(session, duplicate).status == "accepted"


def test_merge_depth_is_one(client, session, dispatcher):
    main = new(session)
    middle = new(session)
    leaf = new(session)
    merge(client, dispatcher, leaf, middle)
    # Сливаем «среднюю» в основную: её слитая переходит к основной
    response = merge(client, dispatcher, middle, main, version=2)  # выросла при слиянии leaf
    assert response.status_code == 200, response.text
    assert row(session, leaf).merged_into_id == main
    assert row(session, main).duplicates_count == 2
    third = new(session)
    refused = merge(client, dispatcher, third, middle)
    assert refused.status_code == 409 and refused.json()["code"] == "main_is_merged"


def test_merge_errors(client, session, dispatcher):
    main = new(session)
    duplicate = new(session)
    assert merge(client, dispatcher, main, main).status_code == 422
    assert merge(client, dispatcher, duplicate, main, version=7).status_code == 409
    assert merge(client, dispatcher, duplicate, main).status_code == 200
    again = merge(client, dispatcher, duplicate, main, version=row(session, duplicate).version)
    assert again.status_code == 409 and again.json()["code"] == "already_merged"
    assert merge(client, dispatcher, duplicate, 10**12).status_code == 404


def test_req_044_remove_duplicate_flag(client, session, dispatcher):
    main = new(session)
    flagged = new(session, duplicate_of_id=main)
    response = client.delete(
        f"{API}/requests/{flagged}/duplicate-flag", params={"version": 1}, headers=dispatcher
    )
    assert response.status_code == 200
    assert response.json()["duplicate_of_id"] is None and response.json()["version"] == 2
    stale = client.delete(
        f"{API}/requests/{flagged}/duplicate-flag", params={"version": 1}, headers=dispatcher
    )
    assert stale.status_code == 409


def test_v_12_manual_merge_of_different_classes(client, session, dispatcher):
    main = new(session, defect_class="big")
    small = new(session, defect_class="small")
    assert merge(client, dispatcher, small, main).status_code == 200
    card = client.get(f"{API}/requests/{main}", headers=dispatcher).json()
    assert card["defect_class"] == "big"  # основная сохраняет свой класс


def test_merge_only_dispatcher(client, session):
    main, duplicate = new(session), new(session)
    headers = login(client, add_user(session, "contractor"))
    assert merge(client, headers, duplicate, main).status_code == 403
