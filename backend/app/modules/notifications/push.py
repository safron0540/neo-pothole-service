"""Push-уведомления на телефон через Firebase Cloud Messaging, HTTP v1 (REQ-031, В-30).

Уведомление в БД создаёт change_status() в своей транзакции. Отсюда push уходит только
после успешного коммита и в фоновом потоке: телефон не должен узнать о смене статуса,
которая откатилась, а ответ API не ждёт Google. Ключ — JSON сервисного аккаунта Firebase
(FCM_CREDENTIALS_FILE). Без ключа push выключен, гражданин видит уведомления опросом.
"""

import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import httpx2
import jwt
from sqlalchemy import delete, event, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.modules.notifications.models import DeviceToken, Notification

log = logging.getLogger(__name__)

SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
SEND_URL = "https://fcm.googleapis.com/v1/projects/{project}/messages:send"
# Ответы FCM, после которых токен больше не годится: приложение удалено или токен чужой
DEAD_TOKEN_CODES = ("UNREGISTERED", "INVALID_ARGUMENT")

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="fcm")


@dataclass(frozen=True)
class Push:
    user_id: int
    request_id: int | None
    title: str
    body: str


class FcmClient:
    """Отправка одного сообщения на один токен; access-токен Google кэшируется на час."""

    def __init__(self, credentials: dict, http: httpx2.Client | None = None):
        self.credentials = credentials
        self.http = http or httpx2.Client(timeout=10)
        self._token: tuple[str, float] | None = None

    def access_token(self) -> str:
        now = time.time()
        if self._token and self._token[1] > now + 60:
            return self._token[0]
        assertion = jwt.encode(
            {
                "iss": self.credentials["client_email"],
                "scope": SCOPE,
                "aud": self.credentials["token_uri"],
                "iat": int(now),
                "exp": int(now) + 3600,
            },
            self.credentials["private_key"],
            algorithm="RS256",
        )
        response = self.http.post(
            self.credentials["token_uri"],
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion,
            },
        )
        response.raise_for_status()
        data = response.json()
        self._token = (data["access_token"], now + data.get("expires_in", 3600))
        return self._token[0]

    def send(self, fcm_token: str, push: Push) -> bool:
        """True — доставлено в FCM или временная ошибка; False — токен мёртвый, удалить."""
        message = {
            "token": fcm_token,
            "notification": {"title": push.title, "body": push.body},
            "data": {"request_id": str(push.request_id or "")},
            "android": {"priority": "high"},
        }
        response = self.http.post(
            SEND_URL.format(project=self.credentials["project_id"]),
            json={"message": message},
            headers={"Authorization": f"Bearer {self.access_token()}"},
        )
        if response.status_code == 404 or (
            response.status_code == 400 and any(c in response.text for c in DEAD_TOKEN_CODES)
        ):
            return False
        if response.is_error:
            log.warning("FCM ответил %s для пользователя %s", response.status_code, push.user_id)
        return True


@lru_cache
def get_client() -> FcmClient | None:
    path = get_settings().fcm_credentials_file
    if not path:
        return None
    try:
        return FcmClient(json.loads(Path(path).read_text(encoding="utf-8")))
    except (OSError, ValueError) as error:
        log.error("Ключ Firebase не прочитан (%s): push выключен", type(error).__name__)
        return None


def deliver(pushes: list[Push], client: FcmClient | None = None, open_session=None) -> None:
    """Фоновая отправка: свои сессия и транзакция, ошибки только в лог."""
    from app.db import SessionLocal

    client = client or get_client()
    if client is None:
        return
    try:
        with (open_session or SessionLocal)() as session:
            dead = []
            for push in pushes:
                tokens = session.scalars(
                    select(DeviceToken.fcm_token).where(DeviceToken.user_id == push.user_id)
                ).all()
                dead += [t for t in tokens if not client.send(t, push)]
            if dead:
                session.execute(delete(DeviceToken).where(DeviceToken.fcm_token.in_(dead)))
                session.commit()
    except Exception:  # push не должен ронять сервис: уведомление всё равно есть в опросе
        log.exception("Push не отправлен")


# --- Сбор уведомлений транзакции и отправка после коммита ---------------------------------


@event.listens_for(Session, "after_flush")
def _collect(session: Session, _context) -> None:
    for obj in session.new:
        if isinstance(obj, Notification):
            session.info.setdefault("push", []).append(
                Push(obj.user_id, obj.request_id, obj.title, obj.body)
            )


@event.listens_for(Session, "after_commit")
def _send_after_commit(session: Session) -> None:
    pushes = session.info.pop("push", None)
    if pushes and get_client() is not None:
        _executor.submit(deliver, pushes)


@event.listens_for(Session, "after_rollback")
def _forget(session: Session) -> None:
    session.info.pop("push", None)
