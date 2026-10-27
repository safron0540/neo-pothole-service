"""Уведомления гражданина: опрос с since, «прочитано», токен устройства (REQ-031, 032, В-30)."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from tests.integration.conftest import add_contractor, add_request, add_user, login

API = "/api/v1"


@pytest.fixture
def citizen(client, session):
    user = add_user(session, "citizen")
    return {**user, "headers": login(client, user)}


def accept(client, session, request_id):
    dispatcher = login(client, add_user(session, "dispatcher"))
    response = client.patch(
        f"{API}/requests/{request_id}/status",
        json={"to": "accepted", "version": 1},
        headers=dispatcher,
    )
    assert response.status_code == 200, response.text


def citizen_request(session, citizen):
    return add_request(
        session,
        60.0,
        100.0,
        author_id=citizen["id"],
        street_group="Б",
        planned_due_at=datetime.now(UTC) + timedelta(hours=72),
        contractor_id=add_contractor(session),
    )


def poll(client, citizen, **params):
    response = client.get(f"{API}/me/notifications", params=params, headers=citizen["headers"])
    assert response.status_code == 200, response.text
    return response.json()


def test_req_031_one_notification_per_status_change(client, session, citizen):
    request_id = citizen_request(session, citizen)
    accept(client, session, request_id)  # «Принято» и сразу «В работе» — две смены
    items = poll(client, citizen)
    assert [n["body"] for n in items] == ["Статус изменён: Принято", "Статус изменён: В работе"]
    assert all(n["request_id"] == request_id and not n["is_read"] for n in items)  # REQ-032


def test_poll_since_returns_only_new(client, session, citizen):
    request_id = citizen_request(session, citizen)
    accept(client, session, request_id)
    first = poll(client, citizen)
    assert poll(client, citizen, since=first[-1]["created_at"]) == []
    assert len(poll(client, citizen, since=first[0]["created_at"])) <= 1


def test_mark_read_only_own(client, session, citizen):
    request_id = citizen_request(session, citizen)
    accept(client, session, request_id)
    own = [n["id"] for n in poll(client, citizen)]
    stranger = {**add_user(session, "citizen")}
    stranger_headers = login(client, stranger)
    response = client.post(
        f"{API}/me/notifications/read", json={"ids": own}, headers=stranger_headers
    )
    assert response.status_code == 204
    assert not any(n["is_read"] for n in poll(client, citizen))  # чужой не отметил
    client.post(f"{API}/me/notifications/read", json={"ids": own[:1]}, headers=citizen["headers"])
    assert [n["is_read"] for n in poll(client, citizen)] == [True, False]


def test_other_citizen_sees_nothing(client, session, citizen):
    accept(client, session, citizen_request(session, citizen))
    other = {"headers": login(client, add_user(session, "citizen"))}
    assert poll(client, other) == []


def test_v_30_device_token_upsert(client, session, citizen):
    body = {"fcm_token": "token-abc", "platform": "android"}
    put = lambda headers: client.put(f"{API}/me/device-token", json=body, headers=headers)  # noqa: E731
    assert put(citizen["headers"]).status_code == 204
    assert put(citizen["headers"]).status_code == 204  # повтор не создаёт дубль
    other = add_user(session, "citizen")
    assert put(login(client, other)).status_code == 204  # тот же телефон, другой аккаунт
    owners = (
        session.execute(text("SELECT user_id FROM device_tokens WHERE fcm_token = 'token-abc'"))
        .scalars()
        .all()
    )
    assert owners == [other["id"]]


def test_notifications_only_for_citizen(client, session):
    dispatcher = login(client, add_user(session, "dispatcher"))
    assert client.get(f"{API}/me/notifications", headers=dispatcher).status_code == 403
    assert client.get(f"{API}/me/notifications").status_code == 401
