"""Справочники и геоданные: районы, группы улиц, улицы, дома, подрядчики.

Поля и ограничения — docs/db-schema.md, раздел 4.1. Геоданные хранятся как
geography (SRID 4326), поэтому расстояния в запросах сразу в метрах.
"""

from geoalchemy2 import Geography
from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import CHAR
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

# GiST-индексы объявлены явно (spatial_index=False), чтобы их имя задавала naming_convention


class District(Base):
    __tablename__ = "districts"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)


class StreetGroup(Base):
    """Группа улиц по ГОСТ Р 50597-2017: срок устранения и порог планового ремонта."""

    __tablename__ = "street_groups"
    __table_args__ = (
        CheckConstraint("code IN ('А', 'Б', 'В', 'Г', 'Д', 'Е')", name="code"),
        CheckConstraint("deadline_hours > 0", name="deadline_hours_positive"),
        CheckConstraint("max_pits > 0", name="max_pits_positive"),
    )

    code: Mapped[str] = mapped_column(CHAR(1), primary_key=True)
    deadline_hours: Mapped[int] = mapped_column(Integer)
    max_pits: Mapped[int] = mapped_column(Integer)


class Street(Base):
    __tablename__ = "streets"
    __table_args__ = (Index("ix_streets_geom", "geom", postgresql_using="gist"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    # Пусто у улицы, добавленной вручную; по нему повторная загрузка обновляет строку
    osm_id: Mapped[int | None] = mapped_column(BigInteger, unique=True)
    street_group: Mapped[str | None] = mapped_column(
        CHAR(1), ForeignKey("street_groups.code", ondelete="RESTRICT")
    )
    district_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("districts.id", ondelete="RESTRICT")
    )
    geom = mapped_column(Geography("LINESTRING", srid=4326, spatial_index=False), nullable=False)


class Building(Base):
    """Дом из OSM с номером. Внешних ключей нет: дом ищется по расстоянию."""

    __tablename__ = "buildings"
    __table_args__ = (
        UniqueConstraint("osm_type", "osm_id"),
        CheckConstraint("osm_type IN ('n', 'w', 'r')", name="osm_type"),
        Index("ix_buildings_geom", "geom", postgresql_using="gist"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    osm_type: Mapped[str] = mapped_column(CHAR(1))
    osm_id: Mapped[int] = mapped_column(BigInteger)
    house_number: Mapped[str] = mapped_column(String(20))
    geom = mapped_column(Geography("POINT", srid=4326, spatial_index=False), nullable=False)


class Contractor(Base):
    __tablename__ = "contractors"
    __table_args__ = (Index("ix_contractors_zone", "zone", postgresql_using="gist"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    phone: Mapped[str] = mapped_column(String(16))  # E.164: +79131234567
    email: Mapped[str] = mapped_column(String(254))
    # Пусто: подрядчик не назначается автоматически
    zone = mapped_column(Geography("MULTIPOLYGON", srid=4326, spatial_index=False))
