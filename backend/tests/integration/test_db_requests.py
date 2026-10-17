"""Заявки в PostGIS: фото, CHECK статусов, неизменяемые поля, триггеры, решения [D].

Нужна база с применёнными миграциями. Каждый тест откатывает свою транзакцию.
"""

import uuid
from contextlib import contextmanager

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app.db import engine

POINT = "SRID=4326;POINT(84.95 56.46)"


@pytest.fixture
def conn():
    with engine.connect() as connection:
        transaction = connection.begin()
        yield connection
        transaction.rollback()


def add_user(conn, role: str) -> int:
    user_id = conn.execute(
        text(
            "INSERT INTO users (login, first_name, last_name, role, password_hash) "
            "VALUES (:login, 'Имя', 'Фамилия', :role, 'hash') RETURNING id"
        ),
        {"login": f"{uuid.uuid4().hex}@example.com", "role": role},
    ).scalar_one()
    if role == "citizen":
        conn.execute(
            text("INSERT INTO citizens (user_id, phone) VALUES (:u, :p)"),
            {"u": user_id, "p": f"+7{user_id:010d}"},
        )
    return user_id


def add_photo(conn, uploader: int, width: int = 1920, height: int = 1080) -> uuid.UUID:
    photo_id = uuid.uuid4()
    conn.execute(
        text(
            "INSERT INTO photos (id, uploader_id, path, mime_type, size_bytes, width, height) "
            "VALUES (:id, :u, :path, 'image/jpeg', 500000, :w, :h)"
        ),
        {"id": photo_id, "u": uploader, "path": f"{photo_id}.jpg", "w": width, "h": height},
    )
    return photo_id


def add_request(conn, author: int, **fields) -> int:
    values = {
        "client_request_id": uuid.uuid4(),
        "author_id": author,
        "before_photo_id": fields.pop("before_photo_id", None) or add_photo(conn, author),
        "location": POINT,
        "defect_class": "big",
        "class_source": "model",
        **fields,
    }
    columns = ", ".join(values)
    params = ", ".join(f":{name}" for name in values)
    return conn.execute(
        text(f"INSERT INTO requests ({columns}) VALUES ({params}) RETURNING id"), values
    ).scalar_one()


@contextmanager
def violates(conn, constraint: str):
    """Ожидаем отказ базы с этим ограничением; savepoint не ломает транзакцию теста."""
    with pytest.raises(IntegrityError, match=constraint), conn.begin_nested():
        yield


def test_request_tables_created(conn):
    tables = set(inspect(conn).get_table_names(schema="public"))
    expected = {
        "photos",
        "requests",
        "request_events",
        "internal_notes",
        "notifications",
        "planned_repair_proposals",
    }
    assert expected <= tables


@pytest.mark.parametrize(("width", "height"), [(1280, 720), (720, 1280), (4000, 3000)])
def test_ft_2_photo_resolution_any_orientation_accepted(conn, width, height):
    add_photo(conn, add_user(conn, "citizen"), width, height)


@pytest.mark.parametrize(("width", "height"), [(1279, 720), (1280, 719), (719, 1280)])
def test_ft_2_photo_resolution_too_small_rejected(conn, width, height):
    citizen = add_user(conn, "citizen")
    with violates(conn, "ck_photos_resolution"):
        add_photo(conn, citizen, width, height)


def test_ft_1_photo_only_jpeg_or_png(conn):
    citizen = add_user(conn, "citizen")
    with violates(conn, "ck_photos_mime_type"):
        conn.execute(
            text(
                "INSERT INTO photos (id, uploader_id, path, mime_type, size_bytes, width, height)"
                " VALUES (:id, :u, 'x.gif', 'image/gif', 1, 1920, 1080)"
            ),
            {"id": uuid.uuid4(), "u": citizen},
        )


def test_req_002_request_defaults(conn):
    request_id = add_request(conn, add_user(conn, "citizen"))
    status, version, pits, duplicates = conn.execute(
        text("SELECT status, version, pits_count, duplicates_count FROM requests WHERE id = :id"),
        {"id": request_id},
    ).one()
    assert (status, version, pits, duplicates) == ("На проверке", 1, 1, 0)


def test_req_002_request_requires_before_photo(conn):
    citizen = add_user(conn, "citizen")
    with violates(conn, "before_photo_id"):
        conn.execute(
            text(
                "INSERT INTO requests (client_request_id, author_id, location, defect_class,"
                " class_source) VALUES (:c, :a, :p, 'big', 'model')"
            ),
            {"c": uuid.uuid4(), "a": citizen, "p": POINT},
        )


def test_req_009_only_citizen_can_be_author(conn):
    dispatcher = add_user(conn, "dispatcher")
    with violates(conn, "fk_requests_author_id_citizens"):
        add_request(conn, dispatcher, before_photo_id=add_photo(conn, dispatcher))


def test_photo_used_by_one_request_only(conn):
    citizen = add_user(conn, "citizen")
    photo = add_photo(conn, citizen)
    add_request(conn, citizen, before_photo_id=photo)
    with violates(conn, "uq_requests_before_photo_id"):
        add_request(conn, citizen, before_photo_id=photo)


def test_repeat_client_request_id_rejected_by_db(conn):
    citizen = add_user(conn, "citizen")
    client_request_id = uuid.uuid4()
    add_request(conn, citizen, client_request_id=client_request_id)
    with violates(conn, "uq_requests_author_id_client_request_id"):
        add_request(conn, citizen, client_request_id=client_request_id)


def test_req_003_status_only_six_values(conn):
    with violates(conn, "ck_requests_status"):
        add_request(conn, add_user(conn, "citizen"), status="Отменено")


def test_req_043_in_work_requires_contractor(conn):
    with violates(conn, "ck_requests_in_work_has_contractor"):
        add_request(conn, add_user(conn, "citizen"), status="В работе", planned_due_at="2026-10-20")


def test_req_063_done_requires_after_photo(conn):
    with violates(conn, "ck_requests_done_has_after_photo"):
        add_request(
            conn,
            add_user(conn, "citizen"),
            status="Выполнено",
            planned_due_at="2026-10-20",
            completed_at="2026-10-19",
        )


def test_v3_accepted_requires_due_date(conn):
    # [D] В-3: без группы улицы срока нет, и принять заявку нельзя
    with violates(conn, "ck_requests_accepted_has_due_date"):
        add_request(conn, add_user(conn, "citizen"), status="Принято")


def test_merged_request_follows_main_without_own_contractor(conn):
    citizen = add_user(conn, "citizen")
    main = add_request(conn, citizen)
    # Слитая заявка повторяет статус основной: своих подрядчика и срока у неё нет
    add_request(conn, citizen, status="В работе", merged_into_id=main)


def test_request_cannot_be_duplicate_of_itself(conn):
    request_id = add_request(conn, add_user(conn, "citizen"))
    with violates(conn, "ck_requests_not_duplicate_of_itself"):
        conn.execute(
            text("UPDATE requests SET duplicate_of_id = id WHERE id = :id"), {"id": request_id}
        )


def test_v2_reject_reason_values(conn):
    citizen = add_user(conn, "citizen")
    add_request(conn, citizen, status="Отклонено", reject_reason="not_a_pit")
    with violates(conn, "ck_requests_reject_reason"):
        add_request(conn, citizen, status="Отклонено", reject_reason="lazy")


@pytest.mark.parametrize(
    "column",
    ["author_id", "client_request_id", "detected_at", "before_photo_id"],
)
def test_immutable_request_fields(conn, column):
    citizen = add_user(conn, "citizen")
    request_id = add_request(conn, citizen)
    new_value = {
        "author_id": add_user(conn, "citizen"),
        "client_request_id": uuid.uuid4(),
        "detected_at": "2020-01-01",
        "before_photo_id": add_photo(conn, citizen),
    }[column]
    with violates(conn, "forbid_requests_immutable"):
        conn.execute(
            text(f"UPDATE requests SET {column} = :v WHERE id = :id"),
            {"v": new_value, "id": request_id},
        )


def test_mutable_fields_can_change_and_updated_at_moves(conn):
    request_id = add_request(conn, add_user(conn, "citizen"), updated_at="2000-01-01")
    conn.execute(
        text("UPDATE requests SET decision_comment = 'уточнить', version = 2 WHERE id = :id"),
        {"id": request_id},
    )
    moved = conn.execute(
        text("SELECT updated_at > '2000-01-02' FROM requests WHERE id = :id"), {"id": request_id}
    ).scalar_one()
    assert moved


def test_req_031_one_notification_per_user_and_event(conn):
    citizen = add_user(conn, "citizen")
    request_id = add_request(conn, citizen)
    event_id = conn.execute(
        text("INSERT INTO request_events (request_id, type) VALUES (:r, 'created') RETURNING id"),
        {"r": request_id},
    ).scalar_one()
    insert = text(
        "INSERT INTO notifications (user_id, request_id, event_id, title, body)"
        " VALUES (:u, :r, :e, 'Заявка', 'Статус изменён')"
    )
    params = {"u": citizen, "r": request_id, "e": event_id}
    conn.execute(insert, params)
    with violates(conn, "uq_notifications_user_id_event_id"):
        conn.execute(insert, params)


def test_request_event_type_check_and_empty_payload(conn):
    request_id = add_request(conn, add_user(conn, "citizen"))
    payload = conn.execute(
        text(
            "INSERT INTO request_events (request_id, type) VALUES (:r, 'processed')"
            " RETURNING payload"
        ),
        {"r": request_id},
    ).scalar_one()
    assert payload == {}
    with violates(conn, "ck_request_events_type"):
        conn.execute(
            text("INSERT INTO request_events (request_id, type) VALUES (:r, 'deleted')"),
            {"r": request_id},
        )


def test_v7_contractor_active_by_default(conn):
    is_active = conn.execute(
        text(
            "INSERT INTO contractors (name, phone, email)"
            " VALUES ('Новый подрядчик', '+73822000001', 'new@example.com') RETURNING is_active"
        )
    ).scalar_one()
    assert is_active is True
