"""change_status() через PATCH /requests/{id}/status на PostGIS (UC-05, REQ-004, REQ-031).

Матрица переходов, version и 409, причина отклонения, автопереход в «В работе»,
одновременное изменение двумя диспетчерами и число уведомлений.
"""

import inspect
import re
import threading
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.statuses import STATUSES
from app.db import engine
from app.errors import ApiError
from app.modules.requests import service
from app.modules.requests.schemas import StatusChange
from tests.integration.conftest import add_contractor, add_photo, add_request, add_user, login

API = "/api/v1"
DUE = datetime.now(UTC) + timedelta(hours=72)


@pytest.fixture
def dispatcher(client, session):
    user = add_user(session, "dispatcher")
    return {**user, "headers": login(client, user)}


def patch(client, dispatcher, request_id, to, version=1, **body):
    return client.patch(
        f"{API}/requests/{request_id}/status",
        json={"to": to, "version": version, **body},
        headers=dispatcher["headers"],
    )


def new_request(session, status="on_review", **fields):
    fields.setdefault("planned_due_at", DUE)
    fields.setdefault("street_group", "Б")
    return add_request(session, 60.0, 100.0, status=status, **fields)


def notifications(session, request_id) -> list[str]:
    return list(
        session.execute(
            text("SELECT body FROM notifications WHERE request_id = :id ORDER BY id"),
            {"id": request_id},
        ).scalars()
    )


def test_req_055_accept_without_contractor_stays_accepted(client, session, dispatcher):
    request_id = new_request(session)
    response = patch(client, dispatcher, request_id, "accepted", comment="Яма подтверждена")
    assert response.status_code == 200
    card = response.json()
    assert card["status"]["code"] == "accepted" and card["version"] == 2
    assert card["needs_contractor"] is True
    assert notifications(session, request_id) == ["Статус изменён: Принято"]


def test_req_043_accept_with_contractor_goes_in_progress(client, session, dispatcher):
    request_id = new_request(session, contractor_id=add_contractor(session))
    card = patch(client, dispatcher, request_id, "accepted").json()
    assert card["status"]["code"] == "in_progress" and card["version"] == 3
    # В-6: две смены статуса — два уведомления
    assert notifications(session, request_id) == [
        "Статус изменён: Принято",
        "Статус изменён: В работе",
    ]
    actors = session.execute(
        text(
            "SELECT actor_id IS NULL FROM request_events"
            " WHERE request_id = :id AND type = 'status_changed' ORDER BY id"
        ),
        {"id": request_id},
    ).scalars()
    assert list(actors) == [False, True]  # второй переход сделала система


def test_v_3_accept_without_group_is_409(client, session, dispatcher):
    request_id = new_request(session, planned_due_at=None, street_group=None)
    response = patch(client, dispatcher, request_id, "accepted")
    assert response.status_code == 409 and response.json()["code"] == "street_group_required"


def test_v_2_reject_needs_reason_and_comment(client, session, dispatcher):
    request_id = new_request(session)
    no_reason = patch(client, dispatcher, request_id, "rejected", comment="Мелкая")
    assert no_reason.status_code == 422
    ok = patch(
        client, dispatcher, request_id, "rejected", comment="Мелкая", reject_reason="small_pit"
    )
    assert ok.status_code == 200
    assert ok.json()["reject_reason"] == "small_pit"
    assert ok.json()["decision_comment"] == "Мелкая"


def test_req_038_clarification_shows_phone_then_accept(client, session, dispatcher):
    request_id = new_request(session)
    card = patch(client, dispatcher, request_id, "needs_clarification").json()
    assert card["applicant"]["phone"].startswith("+7")  # В-27: только в этом статусе
    accepted = patch(client, dispatcher, request_id, "accepted", version=card["version"]).json()
    assert accepted["status"]["code"] == "accepted" and accepted["applicant"] is None


def test_version_conflict_is_409(client, session, dispatcher):
    request_id = new_request(session)
    assert patch(client, dispatcher, request_id, "needs_clarification").status_code == 200
    stale = patch(client, dispatcher, request_id, "accepted", version=1)
    assert stale.status_code == 409 and stale.json()["code"] == "version_conflict"
    assert stale.json()["details"] == {"version": 2}


ALLOWED_BY_DISPATCHER = {
    ("on_review", "accepted"),
    ("on_review", "rejected"),
    ("on_review", "needs_clarification"),
    ("needs_clarification", "accepted"),
    ("needs_clarification", "rejected"),
}


def set_status(session, request_id, status):
    """Исходный статус в обход сервиса: тест проверяет только переход из него."""
    fields = {"s": status, "id": request_id, "photo": None}
    if status == "done":
        author = session.execute(
            text("SELECT author_id FROM requests WHERE id = :id"), {"id": request_id}
        ).scalar_one()
        fields["photo"] = add_photo(session, author)
    session.execute(
        text(
            "UPDATE requests SET status = CAST(:s AS varchar), after_photo_id = :photo,"
            " completed_at = CASE WHEN CAST(:s AS varchar) = 'done' THEN now() END WHERE id = :id"
        ),
        fields,
    )


@pytest.mark.parametrize("current", STATUSES)
@pytest.mark.parametrize("target", STATUSES)
def test_req_004_transition_matrix_for_dispatcher(client, session, dispatcher, current, target):
    request_id = new_request(session, contractor_id=add_contractor(session))
    set_status(session, request_id, current)
    body = {"comment": "Причина", "reject_reason": "other"} if target == "rejected" else {}
    response = patch(client, dispatcher, request_id, target, **body)
    if (current, target) in ALLOWED_BY_DISPATCHER:
        assert response.status_code == 200, response.text
    else:
        assert response.status_code in (403, 409), response.text


def test_contractor_and_citizen_cannot_change_status(client, session):
    request_id = new_request(session)
    for role in ("contractor", "citizen"):
        headers = login(client, add_user(session, role))
        response = client.patch(
            f"{API}/requests/{request_id}/status",
            json={"to": "accepted", "version": 1},
            headers=headers,
        )
        assert response.status_code == 403


def test_unknown_request_is_404(client, dispatcher):
    assert patch(client, dispatcher, 10**12, "accepted").status_code == 404


def test_req_031_notifications_equal_status_changes(client, session, dispatcher):
    request_id = new_request(session, contractor_id=add_contractor(session))
    patch(client, dispatcher, request_id, "needs_clarification")
    patch(client, dispatcher, request_id, "accepted", version=2)
    changes = session.execute(
        text(
            "SELECT count(*) FROM request_events WHERE request_id = :id AND type = 'status_changed'"
        ),
        {"id": request_id},
    ).scalar_one()
    assert changes == 3 and len(notifications(session, request_id)) == 3


# --- Одновременное изменение: настоящие транзакции, данные удаляются после теста ----------


@pytest.fixture
def committed_request():
    with Session(engine) as db:
        dispatcher = add_user(db, "dispatcher")
        request_id = add_request(db, 60.0, 100.0, planned_due_at=DUE, street_group="Б")
        author_id = db.execute(
            text("SELECT author_id FROM requests WHERE id = :id"), {"id": request_id}
        ).scalar_one()
        db.commit()
    yield request_id, dispatcher["id"]
    with engine.begin() as conn:
        params = {"id": request_id, "a": author_id, "d": dispatcher["id"]}
        conn.execute(text("DELETE FROM notifications WHERE request_id = :id"), params)
        conn.execute(text("DELETE FROM request_events WHERE request_id = :id"), params)
        conn.execute(text("DELETE FROM requests WHERE id = :id"), params)
        conn.execute(text("DELETE FROM photos WHERE uploader_id = :a"), params)
        conn.execute(text("DELETE FROM citizens WHERE user_id = :a"), params)
        conn.execute(text("DELETE FROM users WHERE id IN (:a, :d)"), params)


def test_req_004_concurrent_change_one_wins(committed_request):
    """Два диспетчера одновременно меняют заявку с version 1: второй получает 409."""
    request_id, dispatcher_id = committed_request
    barrier = threading.Barrier(2)
    results: list[str] = []

    def act(target: str):
        with Session(engine) as db:
            barrier.wait()
            try:
                service.dispatcher_change_status(
                    db, dispatcher_id, request_id, StatusChange(to=target, version=1)
                )
                results.append("ok")
            except ApiError as error:
                results.append(error.code)

    threads = [threading.Thread(target=act, args=(t,)) for t in ("accepted", "needs_clarification")]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=20)
    assert sorted(results) == ["ok", "version_conflict"]
    with engine.connect() as conn:
        version = conn.execute(
            text("SELECT version FROM requests WHERE id = :id"), {"id": request_id}
        ).scalar_one()
    assert version == 2


def test_status_changes_only_in_change_status():
    """Железное правило 1: присваивание статуса заявки есть только в change_status()."""
    in_module = re.findall(r"\.status = ", inspect.getsource(service))
    in_function = re.findall(r"\.status = ", inspect.getsource(service.change_status))
    assert len(in_module) == len(in_function) == 1
