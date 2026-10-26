"""Тепловая карта по дорогам (REQ-052): уровни детальности, вес ям, фильтры, «вне улиц»."""

import pytest

from tests.integration.conftest import add_request, add_street, add_user, login

API = "/api/v1"
BBOX = "99.99,59.99,100.02,60.01"  # окно вокруг тестовой улицы (≈557 м)


@pytest.fixture
def dispatcher(client, session):
    return login(client, add_user(session, "dispatcher"))


@pytest.fixture
def street(session) -> int:
    return add_street(session, name=f"улица Тепловая {id(session)}")


def pit(session, street, segment=2, **fields) -> int:
    return add_request(
        session, 60.0, 100.005, street_id=street, segment_idx=segment, street_group="Б", **fields
    )


def heat(client, headers, zoom=17, **params):
    response = client.get(
        f"{API}/map/heatmap", params={"bbox": BBOX, "zoom": zoom, **params}, headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()


def own(body, street):
    return [f for f in body["features"] if f["properties"]["street_id"] in (street, None)]


def test_req_052_segment_detail_colours_100m(client, session, dispatcher, street):
    for _ in range(3):
        pit(session, street)
    pit(session, street, segment=4, defect_class="small")
    body = heat(client, dispatcher, zoom=17)
    assert body["type"] == "FeatureCollection" and body["detail"] == "segment"
    segments = {f["properties"]["segment_idx"]: f for f in own(body, street)}
    assert segments[2]["properties"]["count"] == 3
    assert segments[2]["properties"]["level"] == "medium"  # вес 3 на участке
    assert (
        segments[4]["properties"]["weight"] == 0.5 and segments[4]["properties"]["level"] == "low"
    )
    assert segments[2]["geometry"]["type"] == "LineString"
    assert len(segments[2]["geometry"]["coordinates"]) >= 2


def test_req_052_piece_detail_uses_density(client, session, dispatcher, street):
    for _ in range(3):
        pit(session, street)
    feature = own(heat(client, dispatcher, zoom=14), street)[0]
    props = feature["properties"]
    assert heat(client, dispatcher, zoom=14)["detail"] == "piece"
    assert props["segment_idx"] is None and props["count"] == 3
    assert props["per_100m"] == pytest.approx(3 / 5.57, abs=0.05)  # вес на 100 м всей линии


def test_req_052_street_detail_whole_street(client, session, dispatcher, street):
    pit(session, street)
    body = heat(client, dispatcher, zoom=11)
    assert body["detail"] == "street"
    names = [f["properties"]["street"] for f in body["features"]]
    assert f"улица Тепловая {id(session)}" in names


def test_default_only_unfixed_pits_and_no_merged(client, session, dispatcher, street):
    main = pit(session, street, duplicates_count=1)
    pit(session, street, merged_into_id=main)  # слитая — не считается (В-18)
    pit(session, street, status="rejected")  # отклонённая — ямы нет
    segment = own(heat(client, dispatcher), street)[0]
    assert segment["properties"]["count"] == 1
    with_rejected = own(heat(client, dispatcher, status=["on_review", "rejected"]), street)[0]
    assert with_rejected["properties"]["count"] == 2


def test_filters_and_outside_streets(client, session, dispatcher, street):
    pit(session, street, defect_class="small")
    add_request(session, 60.0, 100.005)  # улица не нашлась
    assert own(heat(client, dispatcher, defect_class="big"), street) == []
    assert heat(client, dispatcher)["outside_streets"] >= 1


def test_heatmap_bad_bbox_and_roles(client, session, dispatcher):
    response = client.get(f"{API}/map/heatmap", params={"bbox": "1,2"}, headers=dispatcher)
    assert response.status_code == 422
    headers = login(client, add_user(session, "contractor"))
    assert (
        client.get(f"{API}/map/heatmap", params={"bbox": BBOX}, headers=headers).status_code == 403
    )
