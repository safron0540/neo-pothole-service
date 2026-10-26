"""Внутренние заметки диспетчеров (REQ-060): видит и пишет только диспетчер."""

import pytest

from tests.integration.conftest import add_request, add_user, login

API = "/api/v1"


@pytest.fixture
def dispatcher(client, session):
    return login(client, add_user(session, "dispatcher"))


def test_req_060_add_and_list_notes(client, session, dispatcher):
    request_id = add_request(session, 60.0, 100.0)
    created = client.post(
        f"{API}/requests/{request_id}/notes",
        json={"text": "  Позвонить заявителю  "},
        headers=dispatcher,
    )
    assert created.status_code == 201
    assert created.json()["text"] == "Позвонить заявителю"
    assert created.json()["author"]["name"] == "Фамилия И."
    client.post(
        f"{API}/requests/{request_id}/notes", json={"text": "Дозвонились"}, headers=dispatcher
    )
    notes = client.get(f"{API}/requests/{request_id}/notes", headers=dispatcher).json()
    assert [n["text"] for n in notes] == ["Позвонить заявителю", "Дозвонились"]
    events = client.get(f"{API}/requests/{request_id}/events", headers=dispatcher).json()
    assert [e["type"] for e in events].count("note_added") == 2


def test_empty_note_rejected(client, session, dispatcher):
    request_id = add_request(session, 60.0, 100.0)
    response = client.post(
        f"{API}/requests/{request_id}/notes", json={"text": ""}, headers=dispatcher
    )
    assert response.status_code == 422


def test_notes_of_unknown_request_404(client, dispatcher):
    assert client.get(f"{API}/requests/{10**12}/notes", headers=dispatcher).status_code == 404


def test_notes_hidden_from_citizen_and_contractor(client, session):
    request_id = add_request(session, 60.0, 100.0)
    for role in ("citizen", "contractor"):
        headers = login(client, add_user(session, role))
        assert client.get(f"{API}/requests/{request_id}/notes", headers=headers).status_code == 403
        body = {"text": "x"}
        assert (
            client.post(
                f"{API}/requests/{request_id}/notes", json=body, headers=headers
            ).status_code
            == 403
        )


def test_citizen_card_has_no_notes(client, session, dispatcher):
    citizen = add_user(session, "citizen")
    request_id = add_request(session, 60.0, 100.0, author_id=citizen["id"])
    client.post(f"{API}/requests/{request_id}/notes", json={"text": "секрет"}, headers=dispatcher)
    card = client.get(f"{API}/me/requests/{request_id}", headers=login(client, citizen)).json()
    assert "секрет" not in str(card)
    assert all(e["type"] != "note_added" for e in card["history"])
