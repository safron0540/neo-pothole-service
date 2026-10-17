"""Справочники в PostGIS: таблицы, CHECK, уникальность, запрет удаления используемого.

Нужна база с применёнными миграциями (alembic upgrade head). Каждый тест работает
в транзакции, которая откатывается, поэтому база остаётся чистой.
"""

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app.db import engine

LINE = "SRID=4326;LINESTRING(84.95 56.46, 84.96 56.47)"


@pytest.fixture
def conn():
    with engine.connect() as connection:
        transaction = connection.begin()
        yield connection
        transaction.rollback()


def test_reference_tables_created(conn):
    tables = set(inspect(conn).get_table_names(schema="public"))
    assert {"districts", "street_groups", "streets", "buildings", "contractors"} <= tables


def test_req_074_street_group_code_only_a_to_e(conn):
    with pytest.raises(IntegrityError, match="ck_street_groups_code"), conn.begin_nested():
        conn.execute(text("INSERT INTO street_groups VALUES ('Ж', 24, 2)"))


def test_req_074_street_group_deadline_positive(conn):
    with pytest.raises(IntegrityError, match="deadline_hours_positive"), conn.begin_nested():
        conn.execute(text("INSERT INTO street_groups VALUES ('Б', 0, 2)"))


def test_buildings_unique_by_osm_type_and_id(conn):
    insert = text(
        "INSERT INTO buildings (osm_type, osm_id, house_number, geom) "
        "VALUES (:t, 100, '15А', 'SRID=4326;POINT(84.95 56.46)')"
    )
    conn.execute(insert, {"t": "w"})
    conn.execute(insert, {"t": "n"})  # тот же номер у другого типа объекта OSM допустим
    with pytest.raises(IntegrityError, match="uq_buildings_osm_type_osm_id"), conn.begin_nested():
        conn.execute(insert, {"t": "w"})


def test_req_073_used_district_cannot_be_deleted(conn):
    district_id = conn.execute(
        text("INSERT INTO districts (name) VALUES ('Советский') RETURNING id")
    ).scalar_one()
    conn.execute(
        text("INSERT INTO streets (name, district_id, geom) VALUES ('пр. Ленина', :d, :g)"),
        {"d": district_id, "g": LINE},
    )
    fk = "fk_streets_district_id_districts"
    with pytest.raises(IntegrityError, match=fk), conn.begin_nested():
        conn.execute(text("DELETE FROM districts WHERE id = :d"), {"d": district_id})


def test_geography_distance_in_meters(conn):
    # geography считает расстояние в метрах: 0.001° широты в Томске ≈ 111 м
    meters = conn.execute(
        text(
            "SELECT ST_Distance('SRID=4326;POINT(84.95 56.460)'::geography,"
            " 'SRID=4326;POINT(84.95 56.461)'::geography)"
        )
    ).scalar_one()
    assert 110 < meters < 112
