"""Плановый ремонт (REQ-046, UC-10, В-2, В-14…В-16): участок 100 м и порог группы улицы.

Порог группы А — 2 ямы (миграция 0005): предложение открывается на третьей.
"""

import pytest
from sqlalchemy import text

from tests.integration.conftest import add_request, add_street, add_user, login

API = "/api/v1"
SEGMENT = 2


@pytest.fixture
def dispatcher(client, session):
    return login(client, add_user(session, "dispatcher"))


@pytest.fixture
def street(session) -> int:
    return add_street(session, group="А")


def small_pit(session, street, segment=SEGMENT, **fields) -> int:
    return add_request(
        session,
        60.0,
        100.005,
        defect_class="small",
        street_id=street,
        segment_idx=segment,
        street_group="А",
        **fields,
    )


def reject(client, headers, request_id, reason="small_pit", version=1):
    response = client.patch(
        f"{API}/requests/{request_id}/status",
        json={
            "to": "rejected",
            "version": version,
            "comment": "Малая яма",
            "reject_reason": reason,
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text


def proposal(session, street, segment=SEGMENT):
    return session.execute(
        text(
            "SELECT status, pits_count, threshold FROM planned_repair_proposals"
            " WHERE street_id = :s AND segment_idx = :i"
        ),
        {"s": street, "i": segment},
    ).one_or_none()


def test_req_046_opens_above_threshold(client, session, dispatcher, street):
    pits = [small_pit(session, street) for _ in range(3)]
    reject(client, dispatcher, pits[0])
    reject(client, dispatcher, pits[1])
    assert proposal(session, street) is None  # 2 ямы при пороге 2 — ещё не больше
    reject(client, dispatcher, pits[2])
    assert tuple(proposal(session, street)) == ("open", 3, 2)


def test_v_2_only_small_pit_reason_counts(client, session, dispatcher, street):
    for _ in range(3):
        reject(client, dispatcher, small_pit(session, street), reason="not_a_pit")
    assert proposal(session, street) is None


def test_other_segment_counted_separately(client, session, dispatcher, street):
    for segment in (0, 1, 2):
        reject(client, dispatcher, small_pit(session, street, segment=segment))
    assert proposal(session, street, 0) is None and proposal(session, street, 2) is None


def test_v_16_closes_when_group_threshold_raised(client, session, dispatcher, street):
    for _ in range(3):
        reject(client, dispatcher, small_pit(session, street))
    assert proposal(session, street).status == "open"
    client.put(
        f"{API}/street-groups/А", json={"deadline_hours": 24, "max_pits": 5}, headers=dispatcher
    )
    assert tuple(proposal(session, street)) == ("closed", 3, 5)


def test_v_14_current_street_group_threshold(client, session, dispatcher, street):
    for _ in range(3):
        reject(client, dispatcher, small_pit(session, street))
    # Улицу перевели в группу В (порог 10): берётся текущая группа, а не снимок в заявке
    client.patch(f"{API}/streets/{street}", json={"street_group": "В"}, headers=dispatcher)
    assert tuple(proposal(session, street)) == ("closed", 3, 10)


def test_v_15_merged_duplicate_not_counted(client, session, dispatcher, street):
    pits = [small_pit(session, street) for _ in range(3)]
    for request_id in pits:
        reject(client, dispatcher, request_id)
    assert proposal(session, street).status == "open"
    response = client.post(
        f"{API}/requests/{pits[2]}/merge",
        json={"into_id": pits[0], "version": 2},
        headers=dispatcher,
    )
    assert response.status_code == 200, response.text
    assert tuple(proposal(session, street))[:2] == ("closed", 2)


def test_list_and_detail(client, session, dispatcher, street):
    pits = [small_pit(session, street) for _ in range(3)]
    for request_id in pits:
        reject(client, dispatcher, request_id)
    page = client.get(f"{API}/planned-repairs", params={"limit": 200}, headers=dispatcher).json()
    found = [p for p in page["items"] if p["street"]["id"] == street]
    assert len(found) == 1
    item = found[0]
    assert (
        item["status"] == "open" and item["street_group"] == "А" and item["segment_idx"] == SEGMENT
    )
    assert item["segment"]["type"] == "LineString" and 60.0 <= item["center"]["lat"] <= 60.001
    detail = client.get(f"{API}/planned-repairs/{item['id']}", headers=dispatcher).json()
    assert sorted(r["id"] for r in detail["requests"]) == sorted(pits)
    assert client.get(f"{API}/planned-repairs/{10**12}", headers=dispatcher).status_code == 404


def test_planned_repairs_only_for_dispatcher(client, session):
    headers = login(client, add_user(session, "contractor"))
    assert client.get(f"{API}/planned-repairs", headers=headers).status_code == 403
