"""Общие фикстуры интеграционных тестов API: сессия в откатываемой транзакции и клиент.

Сервисы вызывают commit(), но внутри теста это только savepoint: в конце теста внешняя
транзакция откатывается, и база остаётся чистой.
"""

import json
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


# --- Геоданные: тестовые улицы далеко от Томска (60° с. ш., 100° в. д.) -------------

START, END = (100.0, 60.0), (100.01, 60.0)  # ≈ 557 м по параллели


def add_street(session, name="улица Тестовая", group="Б", district="Тестовый район") -> int:
    district_id = session.execute(
        text(
            "INSERT INTO districts (name) VALUES (:n)"
            " ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id"
        ),
        {"n": district},
    ).scalar_one()
    line = f"SRID=4326;LINESTRING({START[0]} {START[1]}, {END[0]} {END[1]})"
    return session.execute(
        text(
            "INSERT INTO streets (name, street_group, district_id, geom)"
            " VALUES (:n, :g, :d, ST_GeogFromText(:line)) RETURNING id"
        ),
        {"n": name, "g": group, "d": district_id, "line": line},
    ).scalar_one()


def point_near(session, fraction: float, meters: float, azimuth_deg: float = 0) -> tuple:
    """(lat, lon) в meters от точки линии на доле fraction, по азимуту (0 — север)."""
    row = session.execute(
        text(
            "SELECT ST_Y(p::geometry), ST_X(p::geometry) FROM (SELECT ST_Project("
            " ST_LineInterpolatePoint(ST_GeomFromText(:line, 4326), :f)::geography,"
            " :m, radians(:az)) AS p) s"
        ),
        {
            "line": f"LINESTRING({START[0]} {START[1]}, {END[0]} {END[1]})",
            "f": fraction,
            "m": meters,
            "az": azimuth_deg,
        },
    ).one()
    return row[0], row[1]


def add_building(session, lat, lon, number="7") -> None:
    session.execute(
        text(
            "INSERT INTO buildings (osm_type, osm_id, house_number, geom)"
            " VALUES ('n', :id, :num, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography)"
        ),
        {"id": uuid.uuid4().int % 10**12, "num": number, "lat": lat, "lon": lon},
    )


# Зона подрядчика вокруг тестовой улицы
ZONE = (
    "SRID=4326;MULTIPOLYGON(((99.99 59.99, 100.02 59.99, 100.02 60.01, 99.99 60.01, 99.99 59.99)))"
)


# --- Заявки напрямую в БД (минуя API) ---------------------------------------------


def add_photo(session, uploader_id: int, ml: dict | None = None) -> uuid.UUID:
    """Строка photos без файла: для подачи заявки файл не нужен."""
    photo_id = uuid.uuid4()
    session.execute(
        text(
            "INSERT INTO photos (id, uploader_id, path, mime_type, size_bytes, width, height,"
            " ml_json) VALUES (:id, :u, :path, 'image/jpeg', 1, 1280, 720, CAST(:ml AS jsonb))"
        ),
        {
            "id": photo_id,
            "u": uploader_id,
            "path": f"{photo_id}.jpg",
            "ml": json.dumps(ml) if ml else None,
        },
    )
    return photo_id


def add_request(session, lat, lon, defect_class="big", status="on_review", **fields) -> int:
    author = add_user(session, "citizen")["id"]
    photo_id = add_photo(session, author)
    values = {
        "client_request_id": uuid.uuid4(),
        "author_id": author,
        "before_photo_id": photo_id,
        "defect_class": defect_class,
        "class_source": "model",
        "status": status,
        "lat": lat,
        "lon": lon,
        **fields,
    }
    columns = [k for k in values if k not in ("lat", "lon")]
    return session.execute(
        text(
            f"INSERT INTO requests ({', '.join(columns)}, location) VALUES"
            f" ({', '.join(':' + c for c in columns)},"
            " ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography) RETURNING id"
        ),
        values,
    ).scalar_one()
