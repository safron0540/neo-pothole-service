"""GET /requests: фильтры, порядок по приоритету, страницы, слитые не видны (REQ-045, 050, 051).

Каждый тест работает в своём районе и фильтрует по нему, чтобы чужие заявки не мешали.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from tests.integration.conftest import add_contractor, add_request, add_user, login

API = "/api/v1"
NOW = datetime.now(UTC)


@pytest.fixture
def dispatcher(client, session):
    return login(client, add_user(session, "dispatcher"))


@pytest.fixture
def district(session) -> int:
    return session.execute(
        text("INSERT INTO districts (name) VALUES (:n) RETURNING id"),
        {"n": f"Район {uuid.uuid4().hex[:8]}"},
    ).scalar_one()


def new(session, district, **fields) -> int:
    fields.setdefault("street_group", "В")
    fields.setdefault("planned_due_at", NOW + timedelta(hours=120))
    return add_request(session, 60.0, 100.0, district_id=district, **fields)


def ids(client, headers, district, **params) -> list[int]:
    response = client.get(
        f"{API}/requests", params={"district_id": district, "limit": 200, **params}, headers=headers
    )
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["items"]]


def test_req_045_priority_order(client, session, dispatcher, district):
    hour = timedelta(hours=1)
    small = new(
        session, district, defect_class="small", street_group="А", detected_at=NOW - 9 * hour
    )
    group_v = new(session, district, street_group="В", detected_at=NOW - 8 * hour)
    with_dups = new(session, district, street_group="Е", duplicates_count=2, detected_at=NOW)
    group_a_late = new(session, district, street_group="А", detected_at=NOW - 1 * hour)
    group_a_early = new(session, district, street_group="А", detected_at=NOW - 5 * hour)
    no_group = new(
        session, district, street_group=None, planned_due_at=None, detected_at=NOW - 9 * hour
    )
    assert ids(client, dispatcher, district) == [
        with_dups,
        group_a_early,
        group_a_late,
        group_v,
        no_group,
        small,
    ]


def test_sort_by_detected_at_newest_first(client, session, dispatcher, district):
    old = new(session, district, detected_at=NOW - timedelta(days=2))
    fresh = new(session, district, detected_at=NOW)
    assert ids(client, dispatcher, district, sort="detected_at") == [fresh, old]


def test_req_050_status_filter_accepts_several(client, session, dispatcher, district):
    on_review = new(session, district)
    clarify = new(session, district, status="needs_clarification")
    new(session, district, status="rejected")
    found = ids(client, dispatcher, district, status=["on_review", "needs_clarification"])
    assert sorted(found) == sorted([on_review, clarify])


@pytest.mark.parametrize(
    ("param", "value", "match", "other"),
    [
        ("street_group", "А", {"street_group": "А"}, {"street_group": "Б"}),
        ("defect_class", "small", {"defect_class": "small"}, {"defect_class": "big"}),
        ("needs_group", "true", {"street_group": None, "planned_due_at": None}, {}),
        ("needs_group", "false", {}, {"street_group": None, "planned_due_at": None}),
        ("needs_contractor", "true", {}, {"contractor_id": "CONTRACTOR"}),
    ],
)
def test_req_050_simple_filters(client, session, dispatcher, district, param, value, match, other):
    contractor = add_contractor(session)
    fix = lambda d: {k: (contractor if v == "CONTRACTOR" else v) for k, v in d.items()}  # noqa: E731
    wanted = new(session, district, **fix(match))
    new(session, district, **fix(other))
    assert ids(client, dispatcher, district, **{param: value}) == [wanted]


def test_req_050_contractor_and_duplicate_filters(client, session, dispatcher, district):
    contractor = add_contractor(session)
    original = new(session, district, contractor_id=contractor)
    duplicate = new(session, district, duplicate_of_id=original)
    assert ids(client, dispatcher, district, contractor_id=contractor) == [original]
    assert ids(client, dispatcher, district, duplicate="true") == [duplicate]


def test_req_062_overdue_filter(client, session, dispatcher, district):
    contractor = add_contractor(session)
    late = new(
        session,
        district,
        status="in_progress",
        contractor_id=contractor,
        planned_due_at=NOW - timedelta(hours=1),
    )
    new(session, district, status="in_progress", contractor_id=contractor)
    new(session, district, planned_due_at=NOW - timedelta(hours=1))  # на проверке: не просрочка
    assert ids(client, dispatcher, district, overdue="true") == [late]
    items = client.get(
        f"{API}/requests", params={"district_id": district, "overdue": "true"}, headers=dispatcher
    ).json()["items"]
    assert items[0]["is_overdue"] is True


def test_period_filter(client, session, dispatcher, district):
    new(session, district, detected_at=NOW - timedelta(days=10))
    recent = new(session, district, detected_at=NOW - timedelta(days=1))
    since = (NOW - timedelta(days=3)).isoformat()
    assert ids(client, dispatcher, district, detected_from=since) == [recent]
    until = (NOW - timedelta(days=3)).isoformat()
    assert recent not in ids(client, dispatcher, district, detected_to=until)


def test_v_18_merged_requests_hidden(client, session, dispatcher, district):
    main = new(session, district, duplicates_count=1)
    new(session, district, merged_into_id=main)
    assert ids(client, dispatcher, district) == [main]


def test_paging_and_summary_fields(client, session, dispatcher, district):
    created = [new(session, district) for _ in range(3)]
    page = client.get(
        f"{API}/requests",
        params={"district_id": district, "limit": 2, "offset": 1},
        headers=dispatcher,
    ).json()
    assert page["total"] == 3 and page["limit"] == 2 and len(page["items"]) == 2
    item = page["items"][0]
    assert item["district"]["id"] == district and item["version"] == 1
    assert item["needs_group"] is False and item["status"]["code"] == "on_review"
    assert set(created) >= {i["id"] for i in page["items"]}


def test_only_dispatcher_lists(client, session):
    for role in ("citizen", "contractor"):
        headers = login(client, add_user(session, role))
        assert client.get(f"{API}/requests", headers=headers).status_code == 403
    assert client.get(f"{API}/requests").status_code == 401
