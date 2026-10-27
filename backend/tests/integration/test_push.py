"""Push после коммита смены статуса (REQ-031, В-30): кому, что, мёртвые токены удаляются."""

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.modules.notifications import push
from tests.integration.test_notifications import API, accept, citizen, citizen_request  # noqa: F401


class FakeFcm:
    def __init__(self, dead: set[str]):
        self.dead = dead
        self.sent: list[tuple[str, push.Push]] = []

    def send(self, token: str, message: push.Push) -> bool:
        self.sent.append((token, message))
        return token not in self.dead


def test_req_031_push_sent_after_status_change(client, session, citizen, monkeypatch):  # noqa: F811
    fake = FakeFcm(dead={"dead-token"})
    monkeypatch.setattr(push, "get_client", lambda: fake)
    # Вместо фонового потока — сразу; своя сессия на соединении теста, как в потоке
    connection = session.get_bind()
    monkeypatch.setattr(
        push._executor,
        "submit",
        lambda fn, pushes: fn(
            pushes,
            fake,
            lambda: Session(bind=connection, join_transaction_mode="create_savepoint"),
        ),
    )
    for token in ("live-token", "dead-token"):
        body = {"fcm_token": token, "platform": "android"}
        response = client.put(f"{API}/me/device-token", json=body, headers=citizen["headers"])
        assert response.status_code == 204
    request_id = citizen_request(session, citizen)
    accept(client, session, request_id)
    # Два push: «Принято» и сразу «В работе» (подрядчик назначен, REQ-041)
    assert sorted(token for token, _ in fake.sent[:2]) == ["dead-token", "live-token"]
    message = fake.sent[0][1]
    assert (message.user_id, message.request_id) == (citizen["id"], request_id)
    assert message.title == f"Заявка № {request_id}" and "Принято" in message.body
    tokens = session.execute(
        text("SELECT fcm_token FROM device_tokens WHERE user_id = :u"), {"u": citizen["id"]}
    ).scalars()
    assert list(tokens) == ["live-token"]


def test_req_031_no_key_no_push(client, session, citizen, monkeypatch):  # noqa: F811
    monkeypatch.setattr(push, "get_client", lambda: None)
    calls = []
    monkeypatch.setattr(push._executor, "submit", lambda *args: calls.append(args))
    accept(client, session, citizen_request(session, citizen))
    assert calls == []  # без ключа Firebase работает только опрос
