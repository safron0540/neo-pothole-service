"""Справочники диспетчера на PostGIS: районы, группы, улицы, подрядчики (REQ-064, 073, 074)."""

import uuid

import pytest
from sqlalchemy import text

from tests.integration.conftest import add_contractor, add_request, add_street, add_user, login

API = "/api/v1"
LINE = {"type": "LineString", "coordinates": [[100.0, 60.0], [100.01, 60.0]]}
ZONE = {
    "type": "MultiPolygon",
    "coordinates": [
        [[[99.99, 59.99], [100.02, 59.99], [100.02, 60.01], [99.99, 60.01], [99.99, 59.99]]]
    ],
}


@pytest.fixture
def dispatcher(client, session):
    return login(client, add_user(session, "dispatcher"))


def name() -> str:
    return f"Тест {uuid.uuid4().hex[:8]}"


def test_req_073_district_crud(client, session, dispatcher):
    created = client.post(f"{API}/districts", json={"name": name()}, headers=dispatcher)
    assert created.status_code == 201
    district = created.json()
    renamed = client.patch(
        f"{API}/districts/{district['id']}",
        json={"name": "Новое имя " + name()},
        headers=dispatcher,
    )
    assert renamed.json()["name"].startswith("Новое имя")
    assert district["id"] in [
        d["id"] for d in client.get(f"{API}/districts", headers=dispatcher).json()
    ]
    assert client.delete(f"{API}/districts/{district['id']}", headers=dispatcher).status_code == 204


def test_district_name_unique(client, dispatcher):
    same = name()
    assert (
        client.post(f"{API}/districts", json={"name": same}, headers=dispatcher).status_code == 201
    )
    again = client.post(f"{API}/districts", json={"name": same}, headers=dispatcher)
    assert again.status_code == 409 and again.json()["code"] == "name_taken"


def test_uc_12_used_district_not_deleted(client, session, dispatcher):
    street_id = add_street(session, district=name())
    district_id = session.execute(
        text("SELECT district_id FROM streets WHERE id = :id"), {"id": street_id}
    ).scalar_one()
    response = client.delete(f"{API}/districts/{district_id}", headers=dispatcher)
    assert response.status_code == 409 and response.json()["code"] == "in_use"


def test_req_074_street_group_update(client, session, dispatcher):
    groups = client.get(f"{API}/street-groups", headers=dispatcher).json()
    assert [g["code"] for g in groups] == ["А", "Б", "В", "Г", "Д", "Е"]
    response = client.put(
        f"{API}/street-groups/Г", json={"deadline_hours": 100, "max_pits": 20}, headers=dispatcher
    )
    assert response.json() == {"code": "Г", "deadline_hours": 100, "max_pits": 20}


def test_req_073_street_crud_and_filters(client, session, dispatcher):
    district = client.post(f"{API}/districts", json={"name": name()}, headers=dispatcher).json()
    body = {
        "name": "улица Новая",
        "street_group": "В",
        "district_id": district["id"],
        "geometry": LINE,
    }
    created = client.post(f"{API}/streets", json=body, headers=dispatcher)
    assert created.status_code == 201
    street = created.json()
    assert street["geometry"]["coordinates"][0] == [100.0, 60.0] and street["osm_id"] is None
    page = client.get(
        f"{API}/streets", params={"q": "новая", "district_id": district["id"]}, headers=dispatcher
    ).json()
    assert [s["id"] for s in page["items"]] == [street["id"]]
    cleared = client.patch(
        f"{API}/streets/{street['id']}", json={"street_group": None}, headers=dispatcher
    ).json()
    assert cleared["street_group"] is None and cleared["name"] == "улица Новая"


def test_street_with_unknown_district_or_bad_line(client, dispatcher):
    body = {"name": "x", "street_group": None, "district_id": 10**12, "geometry": LINE}
    assert client.post(f"{API}/streets", json=body, headers=dispatcher).status_code == 422


def test_rule_5_street_edit_keeps_request_snapshot(client, session, dispatcher):
    street_id = add_street(session, group="Б")
    request_id = add_request(session, 60.0, 100.0, street_id=street_id, street_group="Б")
    client.patch(f"{API}/streets/{street_id}", json={"street_group": "А"}, headers=dispatcher)
    snapshot = session.execute(
        text("SELECT street_group FROM requests WHERE id = :id"), {"id": request_id}
    ).scalar_one()
    assert snapshot == "Б"


def test_req_064_contractor_crud_with_zone(client, session, dispatcher):
    body = {"name": name(), "phone": "8 3822 556677", "email": "a@b.ru", "zone": ZONE}
    created = client.post(f"{API}/contractors", json=body, headers=dispatcher)
    assert created.status_code == 201, created.text
    contractor = created.json()
    assert contractor["phone"] == "+73822556677" and contractor["is_active"] is True
    assert contractor["zone"]["type"] == "MultiPolygon"
    off = client.patch(
        f"{API}/contractors/{contractor['id']}", json={"is_active": False}, headers=dispatcher
    ).json()
    assert off["is_active"] is False and off["zone"] is not None  # zone не передавали — осталась
    no_zone = client.patch(
        f"{API}/contractors/{contractor['id']}", json={"zone": None}, headers=dispatcher
    ).json()
    assert no_zone["zone"] is None
    active = client.get(f"{API}/contractors", params={"is_active": True}, headers=dispatcher).json()
    assert contractor["id"] not in [c["id"] for c in active]


def test_contractor_bad_zone_and_phone(client, dispatcher):
    bow_tie = {
        "type": "MultiPolygon",
        "coordinates": [[[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]]],  # самопересечение
    }
    body = {"name": name(), "phone": "+73822000000", "email": "a@b.ru", "zone": bow_tie}
    response = client.post(f"{API}/contractors", json=body, headers=dispatcher)
    assert response.status_code == 422 and response.json()["code"] == "invalid_geometry"
    body = {"name": name(), "phone": "123", "email": "a@b.ru"}
    assert client.post(f"{API}/contractors", json=body, headers=dispatcher).status_code == 422


def test_uc_12_contractor_with_requests_not_deleted(client, session, dispatcher):
    contractor_id = add_contractor(session)
    add_request(session, 60.0, 100.0, contractor_id=contractor_id)
    response = client.delete(f"{API}/contractors/{contractor_id}", headers=dispatcher)
    assert response.status_code == 409 and "неактивным" in response.json()["message"]
    free = add_contractor(session)
    assert client.delete(f"{API}/contractors/{free}", headers=dispatcher).status_code == 204


def test_references_only_for_dispatcher(client, session):
    headers = login(client, add_user(session, "contractor"))
    for path in ("/districts", "/street-groups", "/streets", "/contractors"):
        assert client.get(f"{API}{path}", headers=headers).status_code == 403
