"""Геопоиск для автообработки: улица и дом в радиусе, подрядчик по зоне, дубликат.

Всё считается в PostGIS на geography, поэтому расстояния сразу в метрах. Радиусы —
из настроек (30 / 30 / 15 м). «Не найдено» не ошибка: пустое поле становится пометкой
для диспетчера (docs/architecture.md, раздел 9.3).
"""

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core import rules

POINT = "ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography"


@dataclass(frozen=True)
class AddressMatch:
    """Снимок адреса для заявки (REQ-039). Без улицы все поля пустые."""

    street_id: int | None = None
    street_group: str | None = None
    district_id: int | None = None
    segment_idx: int | None = None
    house_number: str | None = None
    address: str | None = None


def match_address(session: Session, lat: float, lon: float) -> AddressMatch:
    settings = get_settings()
    point = {"lat": lat, "lon": lon}
    street = session.execute(
        text(
            "SELECT s.id, s.name, s.street_group, s.district_id, d.name AS district,"
            f" ST_LineLocatePoint(s.geom::geometry, {POINT}::geometry) AS fraction,"
            " ST_Length(s.geom) AS length_m"
            " FROM streets s JOIN districts d ON d.id = s.district_id"
            f" WHERE ST_DWithin(s.geom, {POINT}, :r)"
            f" ORDER BY ST_Distance(s.geom, {POINT}), s.id LIMIT 1"
        ),
        {**point, "r": settings.street_match_radius_m},
    ).one_or_none()
    if street is None:
        return AddressMatch()
    house = session.execute(
        text(
            "SELECT house_number FROM buildings"
            f" WHERE ST_DWithin(geom, {POINT}, :r)"
            f" ORDER BY ST_Distance(geom, {POINT}), id LIMIT 1"
        ),
        {**point, "r": settings.building_match_radius_m},
    ).scalar_one_or_none()
    return AddressMatch(
        street_id=street.id,
        street_group=street.street_group,
        district_id=street.district_id,
        segment_idx=rules.segment_index(street.fraction, street.length_m),
        house_number=house,
        address=rules.format_address(street.name, house, street.district),
    )


def find_contractor(session: Session, lat: float, lon: float) -> int | None:
    """Активный подрядчик, чья зона содержит точку (REQ-041; зоны не пересекаются, В-19)."""
    return session.execute(
        text(
            "SELECT id FROM contractors"
            f" WHERE is_active AND zone IS NOT NULL AND ST_Covers(zone, {POINT})"
            " ORDER BY id LIMIT 1"
        ),
        {"lat": lat, "lon": lon},
    ).scalar_one_or_none()


def find_duplicate(
    session: Session, lat: float, lon: float, defect_class: str, exclude_id: int | None = None
) -> int | None:
    """Ближайшая активная не слитая заявка того же класса в радиусе (REQ-044, В-12, В-13).

    Возвращается основная заявка: если ближайшая сама дубликат, то та, на которую она
    указывает, поэтому цепочка дубликатов всегда глубины 1.
    """
    return session.execute(
        text(
            "SELECT coalesce(duplicate_of_id, id) FROM requests"
            " WHERE status = ANY(:active) AND defect_class = :cls AND merged_into_id IS NULL"
            f" AND id <> :exclude AND ST_DWithin(location, {POINT}, :r)"
            f" ORDER BY ST_Distance(location, {POINT}), detected_at LIMIT 1"
        ),
        {
            "lat": lat,
            "lon": lon,
            "cls": defect_class,
            "active": list(rules.ACTIVE_STATUSES),
            "exclude": exclude_id or 0,
            "r": get_settings().duplicate_radius_m,
        },
    ).scalar_one_or_none()


def deadline_hours(session: Session, street_group: str | None) -> int | None:
    """Срок группы из таблицы street_groups: его меняет диспетчер (REQ-073)."""
    if street_group is None:
        return None
    return session.execute(
        text("SELECT deadline_hours FROM street_groups WHERE code = :g"), {"g": street_group}
    ).scalar_one_or_none()
