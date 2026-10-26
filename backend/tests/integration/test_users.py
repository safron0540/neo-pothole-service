"""Сотрудники (REQ-075, UC-13): создание, отключение с отзывом сессий, сброс пароля."""

import uuid

import pytest

from tests.integration.conftest import PASSWORD, add_contractor, add_user, login

API = "/api/v1"
NEW_PASSWORD = "Another42x"


@pytest.fixture
def dispatcher(client, session):
    return login(client, add_user(session, "dispatcher"))


def body(**changes) -> dict:
    return {
        "login": f"staff-{uuid.uuid4().hex[:8]}",
        "first_name": "Пётр",
        "last_name": "Подрядов",
        "role": "dispatcher",
        "password": PASSWORD,
        **changes,
    }


def staff_login(client, login_: str, password: str):
    return client.post(f"{API}/auth/staff/login", json={"login": login_, "password": password})


def test_req_075_create_dispatcher_and_login(client, dispatcher):
    data = body(login="New.Dispatcher" + uuid.uuid4().hex[:4])
    created = client.post(f"{API}/users", json=data, headers=dispatcher)
    assert created.status_code == 201, created.text
    assert created.json()["login"] == data["login"].lower()
    assert staff_login(client, data["login"], PASSWORD).status_code == 200


def test_v_8_contractor_needs_organization(client, session, dispatcher):
    no_org = client.post(f"{API}/users", json=body(role="contractor"), headers=dispatcher)
    assert no_org.status_code == 422 and no_org.json()["code"] == "contractor_required"
    contractor_id = add_contractor(session)
    data = body(role="contractor", contractor_id=contractor_id)
    created = client.post(f"{API}/users", json=data, headers=dispatcher).json()
    assert created["contractor_id"] == contractor_id
    tokens = staff_login(client, data["login"], PASSWORD).json()
    assert tokens["contractor_id"] == contractor_id


def test_create_user_errors(client, session, dispatcher):
    data = body()
    assert client.post(f"{API}/users", json=data, headers=dispatcher).status_code == 201
    taken = client.post(
        f"{API}/users", json={**data, "login": data["login"].upper()}, headers=dispatcher
    )
    assert taken.status_code == 409 and taken.json()["code"] == "login_taken"
    citizen = client.post(f"{API}/users", json=body(role="citizen"), headers=dispatcher)
    assert citizen.status_code == 422 and citizen.json()["code"] == "staff_only"
    weak = client.post(f"{API}/users", json=body(password="password1"), headers=dispatcher)
    assert weak.json()["code"] == "weak_password"
    extra = body(contractor_id=add_contractor(session))
    assert client.post(f"{API}/users", json=extra, headers=dispatcher).status_code == 422


def test_rule_6_disable_user_revokes_sessions(client, session, dispatcher):
    worker = add_user(session, "contractor")
    tokens = staff_login(client, worker["login"], PASSWORD).json()
    off = client.patch(f"{API}/users/{worker['id']}", json={"is_active": False}, headers=dispatcher)
    assert off.status_code == 200 and off.json()["is_active"] is False
    assert staff_login(client, worker["login"], PASSWORD).status_code == 403
    refresh = client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refresh.status_code == 401


def test_update_names_and_contractor(client, session, dispatcher):
    worker = add_user(session, "contractor")
    other = add_contractor(session)
    changed = client.patch(
        f"{API}/users/{worker['id']}",
        json={"last_name": "Новиков", "contractor_id": other},
        headers=dispatcher,
    ).json()
    assert changed["last_name"] == "Новиков" and changed["contractor_id"] == other
    disp = add_user(session, "dispatcher")
    wrong = client.patch(
        f"{API}/users/{disp['id']}", json={"contractor_id": other}, headers=dispatcher
    )
    assert wrong.status_code == 422


def test_reset_password(client, session, dispatcher):
    worker = add_user(session, "dispatcher")
    old = staff_login(client, worker["login"], PASSWORD).json()
    response = client.post(
        f"{API}/users/{worker['id']}/reset-password",
        json={"password": NEW_PASSWORD},
        headers=dispatcher,
    )
    assert response.status_code == 204
    assert staff_login(client, worker["login"], PASSWORD).status_code == 401
    assert staff_login(client, worker["login"], NEW_PASSWORD).status_code == 200
    assert (
        client.post(f"{API}/auth/refresh", json={"refresh_token": old["refresh_token"]}).status_code
        == 401
    )
    citizen = add_user(session, "citizen")
    url = f"{API}/users/{citizen['id']}/reset-password"
    assert client.post(url, json={"password": NEW_PASSWORD}, headers=dispatcher).status_code == 404


def test_list_users_filters(client, session, dispatcher):
    worker = add_user(session, "contractor")
    page = client.get(
        f"{API}/users", params={"role": "contractor", "limit": 200}, headers=dispatcher
    ).json()
    found = {u["id"]: u for u in page["items"]}
    assert worker["id"] in found and found[worker["id"]]["contractor_id"] == worker["contractor_id"]
    assert all(u["role"] == "contractor" for u in page["items"])


def test_users_only_for_dispatcher(client, session):
    headers = login(client, add_user(session, "contractor"))
    assert client.get(f"{API}/users", headers=headers).status_code == 403
    assert client.post(f"{API}/users", json=body(), headers=headers).status_code == 403
