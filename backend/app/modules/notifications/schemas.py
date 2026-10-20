"""Уведомления гражданину (REQ-031, 032): опрос в MVP, push FCM к итоговой приёмке (В-30)."""

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas import UtcDateTime


class NotificationOut(BaseModel):
    id: int
    request_id: int = Field(description="по нему приложение открывает заявку (REQ-032)")
    title: str
    body: str
    is_read: bool
    created_at: UtcDateTime


class MarkRead(BaseModel):
    ids: list[int] = Field(min_length=1)


class DeviceTokenIn(BaseModel):
    fcm_token: str = Field(min_length=1, max_length=255)
    platform: Literal["android"] = "android"
