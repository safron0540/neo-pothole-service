"""GET /map/points: только видимая область, общие фильтры, отчёт = карта (REQ-048, 067)."""

import uuid

import pytest
from sqlalchemy import text

from tests.integration.conftest import add_request, add_user, login

API = "/api/v1"
BBOX = "99.99,59.99,100.02,60.01"  # запад,юг,восток,север вокруг тестовой точки


@pytest.fixture
def dispatcher(client, session):
    return login(client, add_user(session, "dispatcher"))


@pytest.fixture
def district(session) -> int:
    return session.execute(
        text("INSERT INTO districts (name) VALUES (:n) RETURNING id"),
        {"n": f"Район {uuid.uuid4().hex[:8]}"},
    ).scalar_one()


def points(client, headers, **params):
    response = client.get(f"{API}/map/points", params={"bbox": BBOX, **params}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_req_048_only_points_inside_bbox(client, session, dispatcher, district):
    inside = add_request(session, 60.0, 100.005, district_id=district, address="улица Тестовая")
    add_request(session, 60.5, 100.005, district_id=district)  # севернее окна
    found = points(client, dispatcher, district_id=district)
    assert [p["id"] for p in found] == [inside]
    point = found[0]
    assert (point["lat"], point["lon"]) == (60.0, 100.005)
    assert point["status"] == "on_review" and point["address"] == "улица Тестовая"
    assert point["district"]["id"] == district and point["is_overdue"] is False


def test_req_067_map_equals_list_for_same_filter(client, session, dispatcher, district):
    for status in ("on_review", "on_review", "rejected", "needs_clarification"):
        add_request(session, 60.0, 100.005, district_id=district, status=status)
    params = {"district_id": district, "status": ["on_review", "needs_clarification"]}
    on_map = points(client, dispatcher, **params)
    listed = client.get(f"{API}/requests", params=params, headers=dispatcher).json()
    assert len(on_map) == listed["total"] == 3
    assert {p["id"] for p in on_map} == {i["id"] for i in listed["items"]}


def test_v_18_merged_not_on_map(client, session, dispatcher, district):
    main = add_request(session, 60.0, 100.005, district_id=district, duplicates_count=1)
    add_request(session, 60.0, 100.0051, district_id=district, merged_into_id=main)
    assert [p["id"] for p in points(client, dispatcher, district_id=district)] == [main]


@pytest.mark.parametrize("bad", ["100,60", "100.02,59.99,99.99,60.01", "a,b,c,d"])
def test_bad_bbox_is_422(client, dispatcher, bad):
    response = client.get(f"{API}/map/points", params={"bbox": bad}, headers=dispatcher)
    assert response.status_code == 422 and response.json()["code"] == "invalid_bbox"


def test_map_only_for_dispatcher(client, session):
    for role in ("citizen", "contractor"):
        headers = login(client, add_user(session, role))
        response = client.get(f"{API}/map/points", params={"bbox": BBOX}, headers=headers)
        assert response.status_code == 403


def test_marker_snapped_to_road(client, session, dispatcher, district):
    """GPS в 20 м от улицы (на доме): маркер ставится на дорогу, в карточке — GPS."""
    from tests.integration.conftest import add_street

    street = add_street(session)
    request_id = add_request(session, 60.00018, 100.005, district_id=district, street_id=street)
    point = next(
        p for p in points(client, dispatcher, district_id=district) if p["id"] == request_id
    )
    assert point["lat"] == pytest.approx(60.0, abs=0.00002)  # линия улицы идёт по 60° с. ш.
    card = client.get(f"{API}/requests/{request_id}", headers=dispatcher).json()
    assert card["location"]["lat"] == pytest.approx(60.00018)
