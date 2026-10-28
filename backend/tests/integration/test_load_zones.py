"""Зоны подрядчиков из границ районов OSM (scripts.load_zones) без сети: на квадратах."""

import pytest
from sqlalchemy import text

from scripts import load_zones


def square(west: float, south: float, size: float = 0.01) -> list[dict]:
    corners = [
        (west, south),
        (west + size, south),
        (west + size, south + size),
        (west, south + size),
        (west, south),
    ]
    return [{"lon": lon, "lat": lat} for lon, lat in corners]


def relation(name: str, west: float) -> dict:
    # Граница района в OSM — несколько линий; здесь квадрат из двух половин
    ring = square(west, 60.0)
    return {
        "type": "relation",
        "tags": {"name": name},
        "members": [
            {"type": "way", "role": "outer", "geometry": ring[:3]},
            {"type": "way", "role": "outer", "geometry": ring[2:]},
        ],
    }


@pytest.fixture
def conn(session):
    connection = session.connection()
    for name in load_zones.ZONES:
        connection.execute(
            text(
                "INSERT INTO contractors (name, phone, email) VALUES (:n, '+73822000000', 'z@x.ru')"
                " ON CONFLICT (name) DO NOTHING"
            ),
            {"n": name},
        )
    return connection


def test_zones_follow_districts_and_do_not_overlap(conn):
    # Соседние квадраты чуть налезают друг на друга, как неточные границы в OSM
    data = {
        "elements": [
            relation(name, 100.0 + i * 0.0095) for i, name in enumerate(load_zones.DISTRICTS)
        ]
    }
    report = load_zones.load(conn, data)
    assert len(report) == len(load_zones.ZONES)
    overlap = conn.execute(
        text(
            "SELECT coalesce(max(ST_Area(ST_Intersection(a.zone, b.zone))), 0)"
            " FROM contractors a JOIN contractors b ON a.id < b.id"
            " WHERE a.name = ANY(:n) AND b.name = ANY(:n)"
        ),
        {"n": list(load_zones.ZONES)},
    ).scalar_one()
    assert overlap < 1  # м²: наложения вычтены (В-19)
    west_zone = conn.execute(
        text("SELECT ST_Area(zone) FROM contractors WHERE name = :n"),
        {"n": "Демо-подрядчик «Запад»"},
    ).scalar_one()
    assert west_zone > 1_000_000  # два района ≈ 1,1 км² каждый


def test_missing_district_is_reported(conn):
    with pytest.raises(SystemExit, match="нет границ"):
        load_zones.load(conn, {"elements": [relation("Кировский район", 100.0)]})
