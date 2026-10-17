"""Начальные данные: группы улиц, загрузка улиц и домов из OSM, демо-данные.

Ответы Overpass подставляются готовыми (без сети). Главное требование PR 1-7:
повторный запуск не создаёт дублей.
"""

import pytest
from argon2 import PasswordHasher
from sqlalchemy import text

from app.db import engine
from scripts import load_buildings, load_streets, seed_demo

GROUPS = {
    "проспект Ленина": {"street_group": "А", "district": "Советский район"},
    "Учебная улица": {"street_group": "В", "district": "Кировский район"},
}

STREETS = {
    "elements": [
        {
            "type": "way",
            "id": 9001,
            "tags": {"name": "проспект Ленина", "highway": "primary"},
            "geometry": [{"lat": 56.460, "lon": 84.950}, {"lat": 56.465, "lon": 84.950}],
        },
        {
            "type": "way",
            "id": 9002,
            "tags": {"name": "Учебная улица", "highway": "secondary"},
            "geometry": [{"lat": 56.455, "lon": 84.960}, {"lat": 56.455, "lon": 84.970}],
        },
        {  # нет в street_groups.csv — пропускается
            "type": "way",
            "id": 9003,
            "tags": {"name": "улица Неизвестная", "highway": "residential"},
            "geometry": [{"lat": 56.40, "lon": 84.90}, {"lat": 56.41, "lon": 84.90}],
        },
    ]
}

# Дом-контур буквой «Г»: его центр рамки лежит снаружи, точка должна быть внутри
L_SHAPE = [
    (84.9500, 56.4600),
    (84.9504, 56.4600),
    (84.9504, 56.4601),
    (84.9501, 56.4601),
    (84.9501, 56.4604),
    (84.9500, 56.4604),
    (84.9500, 56.4600),
]
BUILDINGS = {
    "elements": [
        {
            "type": "node",
            "id": 1,
            "lat": 56.4610,
            "lon": 84.9502,
            "tags": {"addr:housenumber": "30"},
        },
        {
            "type": "way",
            "id": 1,  # тот же номер OSM, другой тип объекта
            "tags": {"addr:housenumber": "15А"},
            "geometry": [{"lon": x, "lat": y} for x, y in L_SHAPE],
        },
        {
            "type": "relation",
            "id": 7,
            "center": {"lat": 56.4620, "lon": 84.9503},
            "tags": {"addr:housenumber": "2/1"},
        },
        {"type": "node", "id": 2, "lat": 56.47, "lon": 84.95, "tags": {}},  # без номера
    ]
}


@pytest.fixture
def conn():
    with engine.connect() as connection:
        transaction = connection.begin()
        yield connection
        transaction.rollback()


def count(conn, table: str) -> int:
    return conn.execute(text(f"SELECT count(*) FROM {table}")).scalar_one()


def test_req_040_street_groups_seeded_by_migration(conn):
    rows = conn.execute(
        text("SELECT code, deadline_hours, max_pits FROM street_groups ORDER BY code")
    ).all()
    assert [tuple(r) for r in rows] == [
        ("А", 24, 2),
        ("Б", 72, 2),
        ("В", 120, 10),
        ("Г", 168, 16),
        ("Д", 240, 42),
        ("Е", 288, 104),
    ]


def test_csv_lists_demo_streets_with_valid_groups():
    groups = load_streets.read_groups()
    assert {"проспект Ленина", "Богашёвский тракт", "Учебная улица"} <= set(groups)
    assert groups["Богашёвский тракт"]["street_group"] == "А"
    assert {g["street_group"] for g in groups.values()} <= set("АБВГДЕ")


def test_req_077_load_streets_twice_without_duplicates(conn):
    assert load_streets.load(conn, STREETS, GROUPS) == 2
    assert load_streets.load(conn, STREETS, GROUPS) == 2
    rows = conn.execute(
        text(
            "SELECT s.name, s.street_group, d.name FROM streets s"
            " JOIN districts d ON d.id = s.district_id WHERE s.osm_id IN (9001, 9002, 9003)"
            " ORDER BY s.osm_id"
        )
    ).all()
    assert [tuple(r) for r in rows] == [
        ("проспект Ленина", "А", "Советский район"),
        ("Учебная улица", "В", "Кировский район"),
    ]
    assert count(conn, "districts") == 2


def test_load_buildings_twice_without_duplicates(conn):
    load_streets.load(conn, STREETS, GROUPS)
    assert load_buildings.load(conn, BUILDINGS) == 3
    assert load_buildings.load(conn, BUILDINGS) == 3
    assert count(conn, "buildings") == 3

    inside = conn.execute(
        text(
            "SELECT ST_Covers(ST_GeomFromEWKT(:poly), b.geom::geometry) FROM buildings b"
            " WHERE b.osm_type = 'w' AND b.osm_id = 1"
        ),
        {"poly": load_buildings.element_ewkt(BUILDINGS["elements"][1])},
    ).scalar_one()
    assert inside


def test_buildings_coverage_counts_street_pieces_with_house_in_30m(conn):
    load_streets.load(conn, STREETS, GROUPS)
    load_buildings.load(conn, BUILDINGS)
    covered, total = load_buildings.coverage(conn)
    assert (covered, total) == (1, 2)  # у Ленина дома рядом, у Учебной нет


def test_req_078_seed_demo_twice(conn, monkeypatch):
    monkeypatch.delenv("SEED_PASSWORD", raising=False)
    load_streets.load(conn, STREETS, GROUPS)

    created = seed_demo.seed(conn)
    assert set(created) == {"dispatcher", "contractor1", "citizen@example.com"}
    assert seed_demo.seed(conn) == {}  # повтор пароли не меняет
    assert count(conn, "contractors") == 3

    zones_overlap = conn.execute(
        text(
            "SELECT count(*) FROM contractors a JOIN contractors b ON a.id < b.id"
            " WHERE ST_Overlaps(a.zone::geometry, b.zone::geometry)"
        )
    ).scalar_one()
    assert zones_overlap == 0
    uncovered = conn.execute(
        text(
            "SELECT count(*) FROM streets s WHERE NOT EXISTS (SELECT 1 FROM contractors c"
            " WHERE ST_Covers(c.zone, ST_StartPoint(s.geom::geometry)::geography))"
        )
    ).scalar_one()
    assert uncovered == 0

    password_hash = conn.execute(
        text("SELECT password_hash FROM users WHERE login = 'dispatcher'")
    ).scalar_one()
    assert PasswordHasher().verify(password_hash, created["dispatcher"])
    roles = dict(conn.execute(text("SELECT login, role FROM users")).all())
    assert roles["contractor1"] == "contractor" and roles["citizen@example.com"] == "citizen"
    assert count(conn, "user_consents") == 2


def test_generated_password_meets_rules():
    for _ in range(20):
        password = seed_demo.new_password()
        assert len(password) >= 8
        assert any(c.isupper() for c in password) and any(c.islower() for c in password)
        assert any(c.isdigit() for c in password)
