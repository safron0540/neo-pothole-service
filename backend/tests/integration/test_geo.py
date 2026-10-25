"""Геопоиск автообработки на PostGIS: улица и дом в 30 и 31 м, зона подрядчика, дубликат 15/16 м.

Тестовые улицы лежат далеко от Томска (60° с. ш., 100° в. д.), чтобы не пересекаться
с загруженными из OSM данными. Точки на нужном расстоянии строит ST_Project.
"""

import pytest

from app.modules.geo import service as geo
from tests.integration.conftest import (
    ZONE,
    add_building,
    add_contractor,
    add_request,
    add_street,
    point_near,
)


def test_req_039_street_within_30m_found(session):
    street_id = add_street(session)
    match = geo.match_address(session, *point_near(session, 0.5, 29.5))
    assert match.street_id == street_id and match.street_group == "Б"
    assert match.address == "улица Тестовая, Тестовый район"
    assert match.house_number is None


def test_req_039_street_at_31m_not_found(session):
    add_street(session)
    assert geo.match_address(session, *point_near(session, 0.5, 31)) == geo.AddressMatch()


def test_req_039_house_within_30m(session):
    add_street(session)
    lat, lon = point_near(session, 0.5, 10)
    add_building(session, *point_near(session, 0.5, 39), number="15А")  # 29 м от точки
    match = geo.match_address(session, lat, lon)
    assert match.house_number == "15А"
    assert match.address == "улица Тестовая, 15А, Тестовый район"


def test_req_039_house_at_31m_ignored(session):
    add_street(session)
    add_building(session, *point_near(session, 0.5, 41))  # 31 м от точки
    assert geo.match_address(session, *point_near(session, 0.5, 10)).house_number is None


def test_req_046_segment_of_100m(session):
    add_street(session)
    assert geo.match_address(session, *point_near(session, 0.1, 5)).segment_idx == 0
    assert geo.match_address(session, *point_near(session, 0.5, 5)).segment_idx == 2


def test_street_without_group_gives_empty_group(session):
    add_street(session, group=None)
    match = geo.match_address(session, *point_near(session, 0.5, 5))
    assert match.street_id is not None and match.street_group is None


def test_req_041_contractor_by_zone(session):
    contractor_id = add_contractor(session, ZONE)
    assert geo.find_contractor(session, 60.0, 100.005) == contractor_id
    assert geo.find_contractor(session, 60.05, 100.005) is None


def test_v_7_inactive_contractor_not_assigned(session):
    add_contractor(session, ZONE, is_active=False)
    assert geo.find_contractor(session, 60.0, 100.005) is None


@pytest.mark.parametrize(("meters", "found"), [(14.5, True), (16, False)])
def test_req_044_duplicate_within_15m(session, meters, found):
    first = add_request(session, *point_near(session, 0.5, 0))
    duplicate = geo.find_duplicate(session, *point_near(session, 0.5, meters), "big")
    assert duplicate == (first if found else None)


def test_v_12_duplicate_only_same_class(session):
    add_request(session, *point_near(session, 0.5, 0), defect_class="small")
    assert geo.find_duplicate(session, *point_near(session, 0.5, 5), "big") is None


def test_req_044_closed_requests_are_not_duplicates(session):
    add_request(session, *point_near(session, 0.5, 0), status="rejected")
    assert geo.find_duplicate(session, *point_near(session, 0.5, 5), "big") is None


def test_req_044_duplicate_points_to_original(session):
    original = add_request(session, *point_near(session, 0.5, 0))
    add_request(session, *point_near(session, 0.5, 10), duplicate_of_id=original)
    # Ближе всего второй дубликат, но пометка ведёт на основную заявку
    assert geo.find_duplicate(session, *point_near(session, 0.5, 12), "big") == original


def test_req_040_deadline_from_table(session):
    assert geo.deadline_hours(session, "А") == 24
    assert geo.deadline_hours(session, None) is None
