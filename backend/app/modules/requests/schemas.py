"""Заявки: подача, ответы по ролям, действия диспетчера и подрядчика.

У каждой роли своя схема ответа (REQ-012, 061): подрядчик не видит заявителя,
гражданин не видит заметки, телефон заявителя диспетчеру отдаётся только в статусе
«Требует уточнения» (В-27). Время — UTC с Z.
"""

import uuid
from typing import Literal

from pydantic import BaseModel, Field

from app.modules.requests.models import EVENT_TYPES, REJECT_REASONS
from app.schemas import DefectClass, Point, Ref, StatusCode, StatusOut, StreetGroup, UtcDateTime

RejectReason = Literal[REJECT_REASONS]  # type: ignore[valid-type]
EventType = Literal[EVENT_TYPES]  # type: ignore[valid-type]


class RequestCreate(BaseModel):
    client_request_id: uuid.UUID = Field(
        description="повтор с тем же значением вернёт ту же заявку"
    )
    photo_id: uuid.UUID = Field(description="из POST /photos/analyze")
    location: Point
    accuracy_m: float | None = Field(
        None, ge=0, description="точность GPS; пусто, если точка с карты"
    )
    citizen_comment: str | None = Field(None, max_length=1000)
    manual_class: DefectClass | None = Field(
        None, description="обязателен, если анализ вернул model_unavailable"
    )


class EventOut(BaseModel):
    id: int
    type: EventType
    actor: str = Field(description="«Система» или имя сотрудника (В-9)")
    payload: dict
    created_at: UtcDateTime


class RequestSummary(BaseModel):
    """Строка списка заявок: общее для всех ролей."""

    id: int
    status: StatusOut
    defect_class: DefectClass
    address: str | None
    detected_at: UtcDateTime
    planned_due_at: UtcDateTime | None
    is_overdue: bool


class CitizenRequestOut(RequestSummary):
    location: Point
    citizen_comment: str | None
    photo_before_url: str = Field(description="подписанная ссылка, 15 минут")
    photo_after_url: str | None
    history: list[EventOut] = Field(description="смены статуса; автообработка не показывается")


class Applicant(BaseModel):
    first_name: str
    last_name: str
    phone: str


class DispatcherRequestSummary(RequestSummary):
    street_group: StreetGroup | None
    district: Ref | None
    contractor: Ref | None
    duplicates_count: int
    duplicate_of_id: int | None
    needs_group: bool
    needs_contractor: bool
    version: int = Field(description="для действий диспетчера прямо из списка")


class DispatcherRequestOut(DispatcherRequestSummary):
    location: Point
    accuracy_m: float | None
    house_number: str | None
    street_id: int | None
    model_class: DefectClass | None
    class_source: Literal["model", "citizen", "dispatcher"]
    pits_count: int
    must_fix: bool = Field(description="подлежит устранению по ГОСТ: класс big (REQ-036)")
    recommendation: StatusOut = Field(description="big → Принято, small → Отклонено (REQ-037)")
    reject_reason: RejectReason | None
    decision_comment: str | None
    citizen_comment: str | None
    merged_into_id: int | None
    completed_at: UtcDateTime | None
    photo_before_url: str
    photo_after_url: str | None
    applicant: Applicant | None = Field(description="только в статусе «Требует уточнения» (В-27)")
    version: int = Field(description="передаётся в действиях диспетчера; при конфликте 409")


class ContractorRequestOut(RequestSummary):
    location: Point
    house_number: str | None
    street_group: StreetGroup | None
    photo_before_url: str
    photo_after_url: str | None
    completed_at: UtcDateTime | None
    version: int


class StatusChange(BaseModel):
    to: StatusCode
    version: int
    comment: str | None = Field(None, max_length=2000, description="при отклонении обязателен")
    reject_reason: RejectReason | None = Field(None, description="при отклонении обязательна")


class ClassChange(BaseModel):
    defect_class: DefectClass
    version: int


class StreetGroupChange(BaseModel):
    street_group: StreetGroup
    version: int


class ContractorAssign(BaseModel):
    contractor_id: int
    version: int


class MergeRequest(BaseModel):
    into_id: int = Field(description="основная заявка")
    version: int


class NoteCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class NoteOut(BaseModel):
    id: int
    author: Ref
    text: str
    created_at: UtcDateTime


class MapPoint(BaseModel):
    """Маркер карты и поля для всплывающей подсказки; полная карточка — /requests/{id}."""

    id: int
    lat: float = Field(description="точка на дороге: ближайшая к GPS точка найденной улицы")
    lon: float
    status: StatusCode
    defect_class: DefectClass
    is_overdue: bool
    address: str | None
    street_group: StreetGroup | None
    district: Ref | None
    contractor: Ref | None
    detected_at: UtcDateTime
    planned_due_at: UtcDateTime | None


class HeatProperties(BaseModel):
    street: str
    street_id: int | None = Field(description="пусто, если улица собрана из нескольких кусков")
    segment_idx: int | None = Field(description="номер участка 100 м; только на детальном уровне")
    count: int = Field(description="заявок (ям) на этом отрезке")
    weight: float = Field(description="большая яма — 1, маленькая — 0,5")
    per_100m: float = Field(description="вес на 100 м дороги: по нему выбирается цвет")
    level: Literal["low", "medium", "high", "critical"]


class HeatFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: dict = Field(description="GeoJSON LineString или MultiLineString, [долгота, широта]")
    properties: HeatProperties


class HeatmapOut(BaseModel):
    """Тепловая карта по дорогам (REQ-052): GeoJSON для L.geoJSON(...)."""

    type: Literal["FeatureCollection"] = "FeatureCollection"
    detail: Literal["street", "piece", "segment"] = Field(
        description="улица целиком (zoom ≤ 12), кусок улицы (13–15), участок 100 м (≥ 16)"
    )
    features: list[HeatFeature]
    outside_streets: int = Field(
        description="заявок в окне без улицы в 30 м: их видно только маркерами"
    )
