"""Пользователи и доступ в PostGIS: триггер check_user_role, согласия, токены.

Нужна база с применёнными миграциями. Каждый тест откатывает свою транзакцию.
"""

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app.db import engine


@pytest.fixture
def conn():
    with engine.connect() as connection:
        transaction = connection.begin()
        yield connection
        transaction.rollback()


def add_user(conn, login: str, role: str) -> int:
    return conn.execute(
        text(
            "INSERT INTO users (login, first_name, last_name, role, password_hash) "
            "VALUES (:login, 'Имя', 'Фамилия', :role, 'argon2-hash') RETURNING id"
        ),
        {"login": login, "role": role},
    ).scalar_one()


def add_contractor(conn) -> int:
    return conn.execute(
        text(
            "INSERT INTO contractors (name, phone, email) "
            "VALUES ('ДорСтрой', '+73822000000', 'info@example.com') RETURNING id"
        )
    ).scalar_one()


def test_user_tables_created(conn):
    tables = set(inspect(conn).get_table_names(schema="public"))
    expected = {
        "users",
        "citizens",
        "contractor_users",
        "user_consents",
        "refresh_tokens",
        "device_tokens",
    }
    assert expected <= tables


def test_req_011_user_role_only_known_values(conn):
    with pytest.raises(IntegrityError, match="ck_users_role"), conn.begin_nested():
        add_user(conn, "admin", "admin")


def test_req_012_citizen_profile_requires_citizen_role(conn):
    citizen = add_user(conn, "ivan@example.com", "citizen")
    dispatcher = add_user(conn, "dispatcher1", "dispatcher")
    insert = text("INSERT INTO citizens (user_id, phone) VALUES (:u, :p)")

    conn.execute(insert, {"u": citizen, "p": "+79130000001"})
    with pytest.raises(IntegrityError, match="check_user_role"), conn.begin_nested():
        conn.execute(insert, {"u": dispatcher, "p": "+79130000002"})


def test_req_012_contractor_profile_requires_contractor_role(conn):
    contractor_id = add_contractor(conn)
    worker = add_user(conn, "worker1", "contractor")
    citizen = add_user(conn, "petr@example.com", "citizen")
    insert = text("INSERT INTO contractor_users (user_id, contractor_id) VALUES (:u, :c)")

    conn.execute(insert, {"u": worker, "c": contractor_id})
    with pytest.raises(IntegrityError, match="check_user_role"), conn.begin_nested():
        conn.execute(insert, {"u": citizen, "c": contractor_id})


def test_req_012_role_checked_on_update_too(conn):
    citizen = add_user(conn, "anna@example.com", "citizen")
    dispatcher = add_user(conn, "dispatcher2", "dispatcher")
    conn.execute(
        text("INSERT INTO citizens (user_id, phone) VALUES (:u, '+79130000003')"), {"u": citizen}
    )
    with pytest.raises(IntegrityError, match="check_user_role"), conn.begin_nested():
        conn.execute(
            text("UPDATE citizens SET user_id = :d WHERE user_id = :u"),
            {"d": dispatcher, "u": citizen},
        )


def test_req_007_consent_kinds_and_one_row_per_version(conn):
    user = add_user(conn, "olga@example.com", "citizen")
    insert = text("INSERT INTO user_consents (user_id, kind, doc_version) VALUES (:u, :k, :v)")

    conn.execute(insert, {"u": user, "k": "pd", "v": "1.0"})
    conn.execute(insert, {"u": user, "k": "geo", "v": "1.0"})
    conn.execute(insert, {"u": user, "k": "pd", "v": "1.1"})  # новая версия текста — новая строка
    with pytest.raises(IntegrityError, match="pk_user_consents"), conn.begin_nested():
        conn.execute(insert, {"u": user, "k": "pd", "v": "1.0"})
    with pytest.raises(IntegrityError, match="ck_user_consents_kind"), conn.begin_nested():
        conn.execute(insert, {"u": user, "k": "sms", "v": "1.0"})


def test_refresh_token_hash_unique(conn):
    user = add_user(conn, "token@example.com", "citizen")
    insert = text(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) "
        "VALUES (:u, :h, now() + interval '14 days')"
    )
    conn.execute(insert, {"u": user, "h": "a" * 64})
    with pytest.raises(IntegrityError, match="uq_refresh_tokens_token_hash"), conn.begin_nested():
        conn.execute(insert, {"u": user, "h": "a" * 64})


def test_user_defaults(conn):
    user = add_user(conn, "defaults@example.com", "citizen")
    is_active, created_at = conn.execute(
        text("SELECT is_active, created_at FROM users WHERE id = :u"), {"u": user}
    ).one()
    assert is_active is True
    assert created_at.tzinfo is not None  # timestamptz
