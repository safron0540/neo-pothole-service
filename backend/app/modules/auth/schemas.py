"""Регистрация, вход и токены (REQ-007, 008, 010; БЗ-2…БЗ-4)."""

from pydantic import BaseModel, Field

from app.schemas import Role


class CitizenRegister(BaseModel):
    email: str = Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, description="≥ 8 символов, буквы разных регистров и цифры")
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone: str = Field(pattern=r"^\+?[0-9 ()-]{10,20}$", description="приводится к E.164")
    consent_pd: bool = Field(description="согласие на обработку ПДн; без него 422")
    consent_geo: bool = Field(description="согласие на геолокацию; без него 422")


class LoginRequest(BaseModel):
    login: str = Field(description="email гражданина или логин сотрудника")
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str = Field(description="30 минут")
    refresh_token: str = Field(description="14 дней, при обновлении выдаётся новый")
    token_type: str = "bearer"
    role: Role
    contractor_id: int | None = Field(None, description="только у сотрудника подрядчика")


class MeOut(BaseModel):
    id: int
    login: str
    first_name: str
    last_name: str
    role: Role
    phone: str | None = Field(None, description="только у гражданина")
    contractor_id: int | None = None
