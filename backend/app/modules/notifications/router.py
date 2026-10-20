"""Уведомления гражданина. Опрос — PR 3-3, push через FCM — PR 3-5."""

from datetime import datetime

from fastapi import APIRouter, status

from app.deps import Token
from app.errors import ERROR_RESPONSES, not_implemented
from app.modules.notifications.schemas import DeviceTokenIn, MarkRead, NotificationOut

router = APIRouter(tags=["citizen"], responses=ERROR_RESPONSES)


@router.get(
    "/me/notifications", response_model=list[NotificationOut], summary="Новые уведомления (опрос)"
)
def my_notifications(token: Token, since: datetime | None = None) -> list[NotificationOut]:
    """Приложение опрашивает раз в 30 с и передаёт since = время последнего полученного."""
    not_implemented()


@router.post(
    "/me/notifications/read",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Отметить прочитанными",
)
def mark_read(body: MarkRead, token: Token) -> None:
    not_implemented()


@router.put(
    "/me/device-token",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Токен устройства для push (FCM)",
)
def register_device_token(body: DeviceTokenIn, token: Token) -> None:
    """Приложение присылает FCM-токен после входа и при его смене."""
    not_implemented()
