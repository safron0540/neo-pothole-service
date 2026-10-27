"""Решение диспетчера по предложению планового ремонта (В-16) [D]: в план, точечный
ремонт, выполнено. После точечного ремонта и выполнения ямы считаются заново."""

from datetime import UTC, datetime, timedelta

import pytest

from tests.integration.test_planned_repair import (
    API,
    dispatcher,  # noqa: F401 — фикстура
    proposal,
    reject,
    small_pit,
    street,  # noqa: F401 — фикстура
)


def open_proposal(client, session, headers, street_id, **fields) -> int:
    for _ in range(3):  # порог группы А — 2
        reject(client, headers, small_pit(session, street_id, **fields))
    response = client.get(f"{API}/planned-repairs", headers=headers)
    return next(p["id"] for p in response.json()["items"] if p["street"]["id"] == street_id)


def decide(client, headers, proposal_id, decision, expected=200, **body):
    response = client.post(
        f"{API}/planned-repairs/{proposal_id}/decision",
        json={"decision": decision, **body},
        headers=headers,
    )
    assert response.status_code == expected, response.text
    return response.json()


def test_v_16_plan_then_done(client, session, dispatcher, street):  # noqa: F811
    proposal_id = open_proposal(client, session, dispatcher, street)
    body = decide(client, dispatcher, proposal_id, "plan", comment="Ремонт участка в мае")
    assert body["status"] == "planned" and body["decision_comment"] == "Ремонт участка в мае"
    assert body["decided_at"] is not None and len(body["requests"]) == 3
    # Включённый в план участок не закрывается сам, даже если ямы пропали из подсчёта
    assert decide(client, dispatcher, proposal_id, "done")["status"] == "done"
    assert tuple(proposal(session, street)) == ("done", 0, 2)


def test_v_16_spot_repair_restarts_count(client, session, dispatcher, street):  # noqa: F811
    proposal_id = open_proposal(client, session, dispatcher, street)
    body = decide(client, dispatcher, proposal_id, "spot")
    assert body["status"] == "declined" and body["pits_count"] == 0 and body["requests"] == []
    later = datetime.now(UTC) + timedelta(minutes=1)
    reject(client, dispatcher, small_pit(session, street, detected_at=later))
    reject(client, dispatcher, small_pit(session, street, detected_at=later))
    assert tuple(proposal(session, street)) == ("declined", 2, 2)  # 2 новых — не больше порога
    reject(client, dispatcher, small_pit(session, street, detected_at=later))
    assert tuple(proposal(session, street)) == ("open", 3, 2)  # набралось снова


@pytest.mark.parametrize(
    ("first", "second"), [("plan", "spot"), ("spot", "plan"), ("spot", "done")]
)
def test_v_16_invalid_transition_409(client, session, dispatcher, street, first, second):  # noqa: F811
    proposal_id = open_proposal(client, session, dispatcher, street)
    decide(client, dispatcher, proposal_id, first)
    error = decide(client, dispatcher, proposal_id, second, expected=409)
    assert error["code"] == "invalid_transition"


def test_v_16_done_needs_plan_and_unknown_is_404(client, session, dispatcher, street):  # noqa: F811
    proposal_id = open_proposal(client, session, dispatcher, street)
    decide(client, dispatcher, proposal_id, "done", expected=409)
    decide(client, dispatcher, 10**9, "plan", expected=404)
