"""Уведомления гражданина: опрос раз в 30 с, отметка «прочитано», FCM-токен устройства.

Уведомления создаёт change_status() в той же транзакции, что и смену статуса (REQ-031).
"""

from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.modules.notifications.models import DeviceToken, Notification
from app.modules.notifications.schemas import NotificationOut

POLL_LIMIT = 100  # больше за один опрос не отдаём: остальное придёт следующим


def my_notifications(
    session: Session, user_id: int, since: datetime | None
) -> list[NotificationOut]:
    """Новые после since по возрастанию времени; без since — последние POLL_LIMIT."""
    query = select(Notification).where(Notification.user_id == user_id)
    if since is not None:
        rows = session.scalars(
            query.where(Notification.created_at > since)
            .order_by(Notification.created_at, Notification.id)
            .limit(POLL_LIMIT)
        ).all()
    else:
        rows = session.scalars(
            query.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(POLL_LIMIT)
        ).all()[::-1]
    return [NotificationOut.model_validate(n, from_attributes=True) for n in rows]


def mark_read(session: Session, user_id: int, ids: list[int]) -> None:
    """Чужие и несуществующие номера просто не меняются."""
    session.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.id.in_(ids))
        .values(is_read=True)
    )
    session.commit()


def register_device_token(session: Session, user_id: int, fcm_token: str, platform: str) -> None:
    """Токен телефона для push (В-30). Если телефоном пользуется другой аккаунт — переносим."""
    session.execute(
        insert(DeviceToken)
        .values(user_id=user_id, fcm_token=fcm_token, platform=platform)
        .on_conflict_do_update(
            index_elements=[DeviceToken.fcm_token],
            set_={"user_id": user_id, "platform": platform, "updated_at": func.now()},
        )
    )
    session.commit()
