"""Клиент FCM HTTP v1 без сети: ответы Google подменены (REQ-031, В-30)."""

import httpx2
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.modules.notifications.push import SCOPE, FcmClient, Push

KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
CREDENTIALS = {
    "project_id": "pothole-test",
    "client_email": "push@pothole-test.iam.gserviceaccount.com",
    "token_uri": "https://oauth2.example/token",
    "private_key": KEY.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode(),
}
PUSH = Push(user_id=1, request_id=42, title="Заявка № 42", body="Статус изменён: Принято")


def client_with(send_status: int = 200, send_text: str = "{}"):
    calls = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        calls.append(request)
        if request.url.host == "oauth2.example":
            return httpx2.Response(200, json={"access_token": "at-1", "expires_in": 3600})
        return httpx2.Response(send_status, text=send_text)

    return FcmClient(CREDENTIALS, httpx2.Client(transport=httpx2.MockTransport(handler))), calls


def test_req_031_send_signs_in_once_and_posts_message():
    fcm, calls = client_with()
    assert fcm.send("token-1", PUSH) and fcm.send("token-2", PUSH)
    token_calls = [c for c in calls if c.url.host == "oauth2.example"]
    assert len(token_calls) == 1  # access-токен Google кэшируется
    assertion = dict(httpx2.QueryParams(token_calls[0].content.decode()))["assertion"]
    claims = jwt.decode(
        assertion, KEY.public_key(), algorithms=["RS256"], audience=CREDENTIALS["token_uri"]
    )
    assert claims["scope"] == SCOPE and claims["iss"] == CREDENTIALS["client_email"]
    send = calls[-1]
    assert send.url.path == "/v1/projects/pothole-test/messages:send"
    assert send.headers["Authorization"] == "Bearer at-1"
    message = httpx2.Response(200, content=send.content).json()["message"]
    assert message["token"] == "token-2" and message["data"] == {"request_id": "42"}
    assert message["notification"] == {"title": PUSH.title, "body": PUSH.body}


@pytest.mark.parametrize(
    ("status", "text", "alive"),
    [
        (404, "{}", False),
        (400, '{"error": {"details": [{"errorCode": "UNREGISTERED"}]}}', False),
        (500, "{}", True),  # временная ошибка Google: токен не трогаем
    ],
)
def test_dead_token_detected(status, text, alive):
    fcm, _ = client_with(status, text)
    assert fcm.send("token", PUSH) is alive
