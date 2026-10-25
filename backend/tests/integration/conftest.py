"""Общие фикстуры интеграционных тестов API: сессия в откатываемой транзакции и клиент.

Сервисы вызывают commit(), но внутри теста это только savepoint: в конце теста внешняя
транзакция откатывается, и база остаётся чистой.
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import engine, get_session
from app.main import app
from app.modules.auth.security import hash_password

PASSWORD = "Secret123"


@pytest.fixture
def session():
    with engine.connect() as connection:
        transaction = connection.begin()
        db = Session(bind=connection, join_transaction_mode="create_savepoint")
        yield db
        db.close()
        transaction.rollback()


@pytest.fixture
def client(session):
    app.dependency_overrides[get_session] = lambda: session
    yield TestClient(app)
    app.dependency_overrides.clear()


def add_user(session, role: str, contractor_id: int | None = None, **fields) -> dict:
    """Пользователь с паролем PASSWORD; гражданину — профиль с телефоном."""
    login = fields.pop("login", f"{uuid.uuid4().hex[:12]}@example.com")
    user_id = session.execute(
        text(
            "INSERT INTO users (login, first_name, last_name, role, password_hash, is_active)"
            " VALUES (:login, 'Имя', 'Фамилия', :role, :hash, :active) RETURNING id"
        ),
        {
            "login": login,
            "role": role,
            "hash": hash_password(PASSWORD),
            "active": fields.pop("is_active", True),
        },
    ).scalar_one()
    if role == "citizen":
        session.execute(
            text("INSERT INTO citizens (user_id, phone) VALUES (:u, :p)"),
            {"u": user_id, "p": fields.pop("phone", f"+79{user_id % 10**9:09d}")},
        )
    if role == "contractor":
        contractor_id = contractor_id or add_contractor(session)
        session.execute(
            text("INSERT INTO contractor_users (user_id, contractor_id) VALUES (:u, :c)"),
            {"u": user_id, "c": contractor_id},
        )
    session.flush()
    return {"id": user_id, "login": login, "role": role, "contractor_id": contractor_id}


def add_contractor(session, zone: str | None = None, is_active: bool = True) -> int:
    return session.execute(
        text(
            "INSERT INTO contractors (name, phone, email, zone, is_active)"
            " VALUES (:n, '+73822000000', 'c@example.com', ST_GeogFromText(:z), :a) RETURNING id"
        ),
        {"n": f"Подрядчик {uuid.uuid4().hex[:8]}", "z": zone, "a": is_active},
    ).scalar_one()


def login(client, user: dict) -> dict:
    """Заголовок Authorization для пользователя из add_user."""
    path = "/api/v1/auth/citizen/login" if user["role"] == "citizen" else "/api/v1/auth/staff/login"
    response = client.post(path, json={"login": user["login"], "password": PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
