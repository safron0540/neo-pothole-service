"""Вход и токены через API на PostGIS: регистрация, раздельные входы, ротация refresh."""

from sqlalchemy import text

from tests.integration.conftest import PASSWORD, add_user, login

API = "/api/v1"
NEW_CITIZEN = {
    "email": "Ivan.Petrov@Example.com",
    "password": "Secret123",
    "first_name": "Иван",
    "last_name": "Петров",
    "phone": "8 (913) 555-12-34",
    "consent_pd": True,
    "consent_geo": True,
}


def register(client, **changes):
    return client.post(f"{API}/auth/citizen/register", json={**NEW_CITIZEN, **changes})


def test_req_007_register_creates_user_profile_and_consents(client, session):
    response = register(client)
    assert response.status_code == 201
    assert response.json()["role"] == "citizen"
    row = session.execute(
        text(
            "SELECT u.login, c.phone, count(uc.kind) FROM users u"
            " JOIN citizens c ON c.user_id = u.id JOIN user_consents uc ON uc.user_id = u.id"
            " WHERE u.login = 'ivan.petrov@example.com' GROUP BY u.login, c.phone"
        )
    ).one()
    assert tuple(row) == ("ivan.petrov@example.com", "+79135551234", 2)


def test_req_007_register_without_consent_rejected(client):
    response = register(client, consent_geo=False)
    assert response.status_code == 422
    assert response.json()["code"] == "consent_required"


def test_bz_3_weak_password_rejected(client):
    response = register(client, password="password1")
    assert response.status_code == 422
    assert response.json()["code"] == "weak_password"


def test_req_007_bad_phone_rejected(client):
    assert register(client, phone="+1 202 555 0100").json()["code"] == "invalid_phone"


def test_req_007_email_and_phone_unique(client):
    assert register(client).status_code == 201
    again = register(client, email="IVAN.PETROV@example.com", phone="+79130000001")
    assert again.status_code == 409 and again.json()["code"] == "email_taken"
    same_phone = register(client, email="other@example.com")
    assert same_phone.status_code == 409 and same_phone.json()["code"] == "phone_taken"


def test_req_008_citizen_login_and_me(client, session):
    citizen = add_user(session, "citizen", phone="+79131112233")
    headers = login(client, citizen)
    me = client.get(f"{API}/me", headers=headers).json()
    assert me["role"] == "citizen" and me["phone"] == "+79131112233"


def test_req_001_separate_logins(client, session):
    citizen = add_user(session, "citizen")
    dispatcher = add_user(session, "dispatcher")
    body = {"login": citizen["login"], "password": PASSWORD}
    assert client.post(f"{API}/auth/staff/login", json=body).status_code == 401
    body = {"login": dispatcher["login"], "password": PASSWORD}
    assert client.post(f"{API}/auth/citizen/login", json=body).status_code == 401


def test_req_010_contractor_login_returns_contractor_id(client, session):
    worker = add_user(session, "contractor")
    response = client.post(
        f"{API}/auth/staff/login", json={"login": worker["login"].upper(), "password": PASSWORD}
    )
    assert response.status_code == 200
    assert response.json()["contractor_id"] == worker["contractor_id"]


def test_wrong_password_and_unknown_login_same_answer(client, session):
    dispatcher = add_user(session, "dispatcher")
    wrong = client.post(
        f"{API}/auth/staff/login", json={"login": dispatcher["login"], "password": "x"}
    )
    unknown = client.post(f"{API}/auth/staff/login", json={"login": "no@one.ru", "password": "x"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_disabled_user_cannot_login(client, session):
    dispatcher = add_user(session, "dispatcher", is_active=False)
    response = client.post(
        f"{API}/auth/staff/login", json={"login": dispatcher["login"], "password": PASSWORD}
    )
    assert response.status_code == 403 and response.json()["code"] == "account_disabled"


def staff_tokens(client, session) -> dict:
    dispatcher = add_user(session, "dispatcher")
    return client.post(
        f"{API}/auth/staff/login", json={"login": dispatcher["login"], "password": PASSWORD}
    ).json()


def test_refresh_rotates_token(client, session):
    tokens = staff_tokens(client, session)
    new = client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert new.status_code == 200
    assert new.json()["refresh_token"] != tokens["refresh_token"]
    stored = session.execute(text("SELECT token_hash FROM refresh_tokens")).scalars().all()
    assert tokens["refresh_token"] not in stored  # в БД только хэш


def test_reused_refresh_revokes_all_tokens(client, session):
    tokens = staff_tokens(client, session)
    second = client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    reuse = client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert reuse.status_code == 401
    # Украденный токен повторили: свежий токен честного пользователя тоже отозван
    after = client.post(
        f"{API}/auth/refresh", json={"refresh_token": second.json()["refresh_token"]}
    )
    assert after.status_code == 401


def test_logout_revokes_refresh(client, session):
    tokens = staff_tokens(client, session)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    body = {"refresh_token": tokens["refresh_token"]}
    assert client.post(f"{API}/auth/logout", json=body, headers=headers).status_code == 204
    assert client.post(f"{API}/auth/refresh", json=body).status_code == 401


def test_me_requires_token(client):
    response = client.get(f"{API}/me")
    assert response.status_code == 401 and response.json()["code"] == "unauthorized"
