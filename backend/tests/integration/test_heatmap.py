"""Тепловая карта по дорогам (REQ-052): ямы «греют» дорогу вокруг себя, тепло плавно
спадает с расстоянием, линия без разрывов, масштаб задаёт ширину пятна."""

import pytest

from app.core import rules
from tests.integration.conftest import add_request, add_street, add_user, login

API = "/api/v1"
BBOX = "99.99,59.99,100.02,60.01"  # окно вокруг тестовой улицы (≈557 м по 60° с. ш.)
PIT = (60.0, 100.005)  # точка прямо на линии улицы, ≈ 278 м от начала


@pytest.fixture
def dispatcher(client, session):
    return login(client, add_user(session, "dispatcher"))


@pytest.fixture
def street(session) -> int:
    return add_street(session, name=f"улица Тепловая {id(session)}")


def pit(session, street, **fields) -> int:
    return add_request(session, *PIT, street_id=street, segment_idx=2, street_group="Б", **fields)


def heat(client, headers, zoom=17, **params):
    response = client.get(
        f"{API}/map/heatmap", params={"bbox": BBOX, "zoom": zoom, **params}, headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()


def pieces(body, street) -> list[dict]:
    """Кусочки нашей улицы по порядку вдоль линии (по долготе начала)."""
    own = [f for f in body["features"] if f["properties"]["street_id"] == street]
    return sorted(own, key=lambda f: f["geometry"]["coordinates"][0][0])


def peak(body, street) -> float:
    return max((f["properties"]["per_100m"] for f in pieces(body, street)), default=0)


def test_req_052_heat_peaks_at_pit_and_fades(client, session, dispatcher, street):
    for _ in range(3):
        pit(session, street)
    body = heat(client, dispatcher, zoom=17)
    assert body["type"] == "FeatureCollection" and body["detail"] == "segment"
    line = pieces(body, street)
    values = [f["properties"]["per_100m"] for f in line]
    top = values.index(max(values))
    # Три большие ямы в одном месте: у ямы ≈ 3 на 100 м (medium), дальше — плавно меньше
    assert max(values) == pytest.approx(3 * rules.heat_density(1, 40), rel=0.15)
    assert line[top]["properties"]["level"] == "medium"
    assert values[:top] == sorted(values[:top]) and values[top:] == sorted(
        values[top:], reverse=True
    )
    assert line[0]["properties"]["level"] == "low"  # края пятна — бледные


def test_req_052_line_has_no_gaps(client, session, dispatcher, street):
    pit(session, street)
    line = pieces(heat(client, dispatcher, zoom=17), street)
    for left, right in zip(line, line[1:], strict=False):
        assert left["geometry"]["coordinates"][-1] == pytest.approx(
            right["geometry"]["coordinates"][0]
        )
    # Шире 3σ = 120 м от ямы тепла нет: кусочков не больше ≈ 240 м / 20 м
    assert 4 <= len(line) <= 13


def test_req_052_zoom_widens_spot(client, session, dispatcher, street):
    for _ in range(3):
        pit(session, street)
    near, far = heat(client, dispatcher, zoom=17), heat(client, dispatcher, zoom=11)
    assert far["detail"] == "street"
    assert peak(far, street) < peak(near, street)  # издалека пятно шире и бледнее
    assert len(pieces(far, street)) <= len(pieces(near, street))


def test_small_pit_weighs_half(client, session, dispatcher, street):
    pit(session, street, defect_class="small")
    assert peak(heat(client, dispatcher), street) == pytest.approx(
        0.5 * rules.heat_density(1, 40), rel=0.15
    )


def test_default_only_unfixed_pits_and_no_merged(client, session, dispatcher, street):
    main = pit(session, street, duplicates_count=1)
    pit(session, street, merged_into_id=main)  # слитая — не считается (В-18)
    pit(session, street, status="rejected")  # отклонённая — ямы нет
    single = peak(heat(client, dispatcher), street)
    assert single == pytest.approx(rules.heat_density(1, 40), rel=0.15)
    with_rejected = peak(heat(client, dispatcher, status=["on_review", "rejected"]), street)
    assert with_rejected == pytest.approx(2 * single, rel=0.05)


def test_filters_and_outside_streets(client, session, dispatcher, street):
    pit(session, street, defect_class="small")
    assert pieces(heat(client, dispatcher, defect_class="big"), street) == []
    add_request(session, 60.0005, 100.005)  # улица не нашлась при подаче
    body = heat(client, dispatcher)
    assert body["outside_streets"] >= 1
    assert pieces(body, street)  # но яма в 55 м от дороги всё равно её греет


def test_heatmap_bad_bbox_and_roles(client, session, dispatcher):
    response = client.get(f"{API}/map/heatmap", params={"bbox": "1,2"}, headers=dispatcher)
    assert response.status_code == 422
    headers = login(client, add_user(session, "contractor"))
    response = client.get(f"{API}/map/heatmap", params={"bbox": BBOX}, headers=headers)
    assert response.status_code == 403
