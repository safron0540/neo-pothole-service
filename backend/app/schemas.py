"""Общие схемы API: время в UTC, статус заявки, страница списка, GeoJSON."""

from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, PlainSerializer

from app.core.statuses import STATUSES, status_label

StatusCode = Literal[STATUSES]  # type: ignore[valid-type]
DefectClass = Literal["big", "small"]
Role = Literal["citizen", "dispatcher", "contractor"]
StreetGroup = Literal["А", "Б", "В", "Г", "Д", "Е"]


def to_utc_z(value: datetime) -> str:
    """ISO-8601 в UTC с Z (ЛК-2). Время без пояса считается уже UTC."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


UtcDateTime = Annotated[datetime, PlainSerializer(to_utc_z, return_type=str, when_used="json")]


class StatusOut(BaseModel):
    """Статус заявки: код для программ и русская подпись для экрана (В-37)."""

    code: StatusCode
    label: str

    @classmethod
    def of(cls, code: str) -> "StatusOut":
        return cls(code=code, label=status_label(code))


class Page[T](BaseModel):
    items: list[T]
    total: int
    limit: int
    offset: int


class Ref(BaseModel):
    """Ссылка на справочник: id и название."""

    id: int
    name: str


class Point(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class GeoLineString(BaseModel):
    type: Literal["LineString"]
    coordinates: list[tuple[float, float]] = Field(min_length=2, description="[[lon, lat], …]")


class GeoMultiPolygon(BaseModel):
    type: Literal["MultiPolygon"]
    coordinates: list[list[list[tuple[float, float]]]] = Field(description="GeoJSON, [lon, lat]")
