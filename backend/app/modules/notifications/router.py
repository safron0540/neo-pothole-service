"""Уведомления гражданина: опрос и токен устройства. Отправка push через FCM — PR 3-5."""

from datetime import datetime

from fastapi import APIRouter, status

from app.deps import CitizenUser, DbSession
from app.errors import ERROR_RESPONSES
from app.modules.notifications import service
from app.modules.notifications.schemas import DeviceTokenIn, MarkRead, NotificationOut

router = APIRouter(tags=["citizen"], responses=ERROR_RESPONSES)


@router.get(
    "/me/notifications", response_model=list[NotificationOut], summary="Новые уведомления (опрос)"
)
def my_notifications(
    user: CitizenUser, session: DbSession, since: datetime | None = None
) -> list[NotificationOut]:
    """Приложение опрашивает раз в 30 с и передаёт since = время последнего полученного.
    Без since — последние 100. Ответ по возрастанию времени."""
    return service.my_notifications(session, user.id, since)


@router.post(
    "/me/notifications/read",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Отметить прочитанными",
)
def mark_read(body: MarkRead, user: CitizenUser, session: DbSession) -> None:
    service.mark_read(session, user.id, body.ids)


@router.put(
    "/me/device-token",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Токен устройства для push (FCM)",
)
def register_device_token(body: DeviceTokenIn, user: CitizenUser, session: DbSession) -> None:
    """Приложение присылает FCM-токен после входа и при его смене."""
    service.register_device_token(session, user.id, body.fcm_token, body.platform)
