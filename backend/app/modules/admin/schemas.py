"""Справочники и сотрудники (REQ-064, 073…075, UC-12, UC-13)."""

from pydantic import BaseModel, Field

from app.schemas import GeoLineString, GeoMultiPolygon, Role, StreetGroup


class DistrictIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class DistrictOut(DistrictIn):
    id: int


class StreetGroupOut(BaseModel):
    code: StreetGroup
    deadline_hours: int = Field(gt=0, description="срок устранения от момента обнаружения")
    max_pits: int = Field(gt=0, description="порог для планового ремонта на участке 100 м")


class StreetGroupUpdate(BaseModel):
    deadline_hours: int = Field(gt=0)
    max_pits: int = Field(gt=0)


class StreetIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    street_group: StreetGroup | None
    district_id: int
    geometry: GeoLineString


class StreetUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    street_group: StreetGroup | None = None
    district_id: int | None = None


class StreetOut(BaseModel):
    id: int
    name: str
    street_group: StreetGroup | None
    district_id: int
    osm_id: int | None
    geometry: GeoLineString


class ContractorIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    phone: str = Field(max_length=16, description="E.164")
    email: str = Field(max_length=254)
    zone: GeoMultiPolygon | None = Field(None, description="не пересекается с чужими зонами (В-19)")


class ContractorUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    phone: str | None = Field(None, max_length=16)
    email: str | None = Field(None, max_length=254)
    zone: GeoMultiPolygon | None = None
    is_active: bool | None = Field(None, description="неактивному ничего не назначается (В-7)")


class ContractorOut(BaseModel):
    id: int
    name: str
    phone: str
    email: str
    zone: GeoMultiPolygon | None
    is_active: bool


class UserCreate(BaseModel):
    login: str = Field(min_length=3, max_length=254)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    role: Role = Field(description="dispatcher или contractor; граждане регистрируются сами")
    password: str = Field(min_length=8)
    contractor_id: int | None = Field(None, description="обязателен для роли contractor")


class UserUpdate(BaseModel):
    first_name: str | None = Field(None, min_length=1, max_length=100)
    last_name: str | None = Field(None, min_length=1, max_length=100)
    is_active: bool | None = Field(None, description="пользователей не удаляем, а отключаем")
    contractor_id: int | None = None


class UserOut(BaseModel):
    id: int
    login: str
    first_name: str
    last_name: str
    role: Role
    is_active: bool
    contractor_id: int | None


class PasswordReset(BaseModel):
    password: str = Field(min_length=8)
