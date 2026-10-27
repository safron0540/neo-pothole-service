"""Зоны подрядчиков (REQ-041, В-19): не пересекаются, граница общая — можно, заявка в зоне."""

import uuid

import pytest

from app.modules.geo import service as geo
from tests.integration.conftest import add_user, login

API = "/api/v1"


def square(west: float, south: float, east: float, north: float) -> dict:
    ring = [[west, south], [east, south], [east, north], [west, north], [west, south]]
    return {"type": "MultiPolygon", "coordinates": [[ring]]}


LEFT = square(100.00, 60.00, 100.01, 60.01)
RIGHT = square(100.01, 60.00, 100.02, 60.01)  # касается LEFT по долготе 100.01
OVERLAP = square(100.005, 60.00, 100.015, 60.01)


@pytest.fixture
def dispatcher(client, session):
    return login(client, add_user(session, "dispatcher"))


def create(client, headers, zone, **extra):
    body = {
        "name": f"Подрядчик {uuid.uuid4().hex[:8]}",
        "phone": "+73822000000",
        "email": "z@example.com",
        "zone": zone,
        **extra,
    }
    return client.post(f"{API}/contractors", json=body, headers=headers)


def test_v_19_overlapping_zone_rejected(client, dispatcher):
    first = create(client, dispatcher, LEFT)
    assert first.status_code == 201
    clash = create(client, dispatcher, OVERLAP)
    assert clash.status_code == 422 and clash.json()["code"] == "zone_overlap"
    assert clash.json()["details"]["with"] == first.json()["name"]


def test_v_19_touching_zones_allowed(client, dispatcher):
    assert create(client, dispatcher, LEFT).status_code == 201
    assert create(client, dispatcher, RIGHT).status_code == 201


def test_v_7_inactive_zone_does_not_block_and_reactivation_is_checked(client, dispatcher):
    old = create(client, dispatcher, LEFT).json()
    client.patch(f"{API}/contractors/{old['id']}", json={"is_active": False}, headers=dispatcher)
    assert create(client, dispatcher, OVERLAP).status_code == 201  # договор со старым расторгнут
    back = client.patch(
        f"{API}/contractors/{old['id']}", json={"is_active": True}, headers=dispatcher
    )
    assert back.status_code == 422 and back.json()["code"] == "zone_overlap"


def test_v_19_zone_change_checked(client, dispatcher):
    create(client, dispatcher, LEFT)
    other = create(client, dispatcher, RIGHT).json()
    moved = client.patch(
        f"{API}/contractors/{other['id']}", json={"zone": OVERLAP}, headers=dispatcher
    )
    assert moved.status_code == 422
    renamed = client.patch(
        f"{API}/contractors/{other['id']}",
        json={"name": f"Новое {uuid.uuid4().hex[:6]}"},
        headers=dispatcher,
    )
    assert renamed.status_code == 200  # зону не трогали — проверки нет


def test_req_041_request_in_new_zone_gets_contractor(client, session, dispatcher):
    contractor = create(client, dispatcher, LEFT).json()
    assert geo.find_contractor(session, 60.005, 100.005) == contractor["id"]
    assert geo.find_contractor(session, 60.005, 100.015) is None  # вне всех зон
