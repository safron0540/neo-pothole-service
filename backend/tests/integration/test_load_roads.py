"""Все дороги из OSM, включая дворы (scripts.load_roads), без сети: на квадратах."""

from sqlalchemy import text

from scripts import load_roads, load_zones
from tests.integration.test_load_zones import relation

GROUPS = {"Тестовая улица": {"street_group": "Б", "district": "Советский район"}}


def way(osm_id: int, west: float, **tags) -> dict:
    # Короткий отрезок внутри квадрата района с западной границей west
    geometry = [{"lon": west + 0.002, "lat": 60.005}, {"lon": west + 0.008, "lat": 60.005}]
    return {"type": "way", "id": osm_id, "tags": tags, "geometry": geometry}


def data(*ways: dict) -> dict:
    districts = [relation(name, 100.0 + i * 0.01) for i, name in enumerate(load_zones.DISTRICTS)]
    return {"elements": [*districts, *ways]}


def street(conn, osm_id: int):
    return conn.execute(
        text(
            "SELECT s.name, s.street_group, d.name AS district FROM streets s"
            " JOIN districts d ON d.id = s.district_id WHERE s.osm_id = :id"
        ),
        {"id": osm_id},
    ).one_or_none()


def test_yard_road_gets_default_group_and_district_by_location(session):
    conn = session.connection()
    # Третий квадрат — третий район из списка
    load_roads.load(conn, data(way(9_000_001, 100.02, highway="service")), GROUPS)
    row = street(conn, 9_000_001)
    assert row.name == load_roads.UNNAMED
    assert row.street_group == load_roads.DEFAULT_GROUP == "Е"
    assert row.district == load_zones.DISTRICTS[2]


def test_listed_street_keeps_group_and_district_from_csv(session):
    conn = session.connection()
    road = way(9_000_002, 100.0, highway="primary", name="Тестовая улица")
    load_roads.load(conn, data(road), GROUPS)
    row = street(conn, 9_000_002)
    assert (row.street_group, row.district) == ("Б", "Советский район")


def test_reload_keeps_group_set_by_dispatcher(session):
    conn = session.connection()
    yard = way(9_000_003, 100.0, highway="service")
    load_roads.load(conn, data(yard), GROUPS)
    conn.execute(text("UPDATE streets SET street_group = 'Г' WHERE osm_id = 9000003"))
    load_roads.load(conn, data(yard), GROUPS)
    assert street(conn, 9_000_003).street_group == "Г"


def test_drive_through_is_skipped(session):
    conn = session.connection()
    count = load_roads.load(
        conn, data(way(9_000_004, 100.0, highway="service", service="drive-through")), GROUPS
    )
    assert count == 0
    assert street(conn, 9_000_004) is None
