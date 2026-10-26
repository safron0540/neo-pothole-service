"""Справочники и сотрудники: районы, группы улиц, улицы, подрядчики, пользователи.

REQ-064, 073…075.

Справочник, на который ссылаются заявки или улицы, не удаляется: 409 (UC-12 А2).
Правка справочника не меняет уже поданные заявки: адрес, район и группа в них — снимок.
Геометрия приходит и уходит в GeoJSON ([долгота, широта]), в БД — geography.
"""

import json

from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import validators
from app.deps import Pagination
from app.errors import ApiError
from app.modules.admin.schemas import (
    ContractorIn,
    ContractorOut,
    ContractorUpdate,
    DistrictOut,
    StreetGroupOut,
    StreetGroupUpdate,
    StreetIn,
    StreetOut,
    StreetUpdate,
    UserCreate,
    UserOut,
    UserUpdate,
)
from app.modules.auth.models import ContractorUser, RefreshToken, User
from app.modules.auth.security import hash_password
from app.modules.geo.models import Contractor, District, Street, StreetGroup
from app.schemas import Page


def not_found(what: str) -> ApiError:
    return ApiError(404, "not_found", f"{what} не найден")


def in_use(what: str, hint: str = "") -> ApiError:
    return ApiError(409, "in_use", f"{what} используется в заявках или справочниках{hint}")


def _commit_or_conflict(session: Session, error: ApiError) -> None:
    """Уникальность и внешние ключи проверяет база: нарушение превращаем в 409."""
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise error from exc


def geography(session: Session, geojson: dict, kind: str) -> str:
    """GeoJSON → EWKT для колонки geography; неверная фигура — 422."""
    row = session.execute(
        text(
            "SELECT ST_IsValid(g), ST_AsEWKT(g) FROM"
            " (SELECT ST_SetSRID(ST_GeomFromGeoJSON(:j), 4326) AS g) s"
        ),
        {"j": json.dumps(geojson)},
    ).one_or_none()
    if row is None or not row[0]:
        raise ApiError(422, "invalid_geometry", f"{kind}: фигура некорректна")
    return row[1]


def as_geojson(session: Session, table: str, column: str, row_id: int) -> dict | None:
    value = session.execute(
        text(f"SELECT ST_AsGeoJSON({column}::geometry, 7) FROM {table} WHERE id = :id"),
        {"id": row_id},
    ).scalar_one_or_none()
    return json.loads(value) if value else None


# --- Районы ---------------------------------------------------------------------------


def list_districts(session: Session) -> list[DistrictOut]:
    rows = session.scalars(select(District).order_by(District.name))
    return [DistrictOut(id=d.id, name=d.name) for d in rows]


def create_district(session: Session, name: str) -> DistrictOut:
    district = District(name=name.strip())
    session.add(district)
    _commit_or_conflict(session, ApiError(409, "name_taken", "Такой район уже есть"))
    return DistrictOut(id=district.id, name=district.name)


def update_district(session: Session, district_id: int, name: str) -> DistrictOut:
    district = session.get(District, district_id)
    if district is None:
        raise not_found("Район")
    district.name = name.strip()
    _commit_or_conflict(session, ApiError(409, "name_taken", "Такой район уже есть"))
    return DistrictOut(id=district.id, name=district.name)


def delete_district(session: Session, district_id: int) -> None:
    district = session.get(District, district_id)
    if district is None:
        raise not_found("Район")
    session.delete(district)
    _commit_or_conflict(session, in_use("Район"))


# --- Группы улиц ----------------------------------------------------------------------


def list_street_groups(session: Session) -> list[StreetGroupOut]:
    rows = session.scalars(select(StreetGroup).order_by(StreetGroup.code))
    return [StreetGroupOut.model_validate(g, from_attributes=True) for g in rows]


def update_street_group(session: Session, code: str, body: StreetGroupUpdate) -> StreetGroupOut:
    """Новый срок — для новых заявок; уже рассчитанные сроки не меняются (REQ-074)."""
    group = session.get(StreetGroup, code)
    if group is None:
        raise ApiError(404, "not_found", "Группа не найдена")
    group.deadline_hours, group.max_pits = body.deadline_hours, body.max_pits
    session.commit()
    return StreetGroupOut.model_validate(group, from_attributes=True)


# --- Улицы ----------------------------------------------------------------------------


def _street_out(session: Session, street: Street) -> StreetOut:
    return StreetOut(
        id=street.id,
        name=street.name,
        street_group=street.street_group,
        district_id=street.district_id,
        osm_id=street.osm_id,
        geometry=as_geojson(session, "streets", "geom", street.id),
    )


def list_streets(
    session: Session,
    paging: Pagination,
    q: str | None,
    district_id: int | None,
    street_group: str | None,
) -> Page[StreetOut]:
    where = []
    if q:
        where.append(Street.name.ilike(f"%{q.strip()}%"))
    if district_id is not None:
        where.append(Street.district_id == district_id)
    if street_group is not None:
        where.append(Street.street_group == street_group)
    total = session.scalar(select(func.count()).select_from(Street).where(*where))
    rows = session.scalars(
        select(Street)
        .where(*where)
        .order_by(Street.name, Street.id)
        .limit(paging.limit)
        .offset(paging.offset)
    ).all()
    return Page(
        items=[_street_out(session, s) for s in rows],
        total=total,
        limit=paging.limit,
        offset=paging.offset,
    )


def _check_district(session: Session, district_id: int) -> None:
    if session.get(District, district_id) is None:
        raise ApiError(422, "unknown_district", "Такого района нет")


def create_street(session: Session, body: StreetIn) -> StreetOut:
    _check_district(session, body.district_id)
    street = Street(
        name=body.name.strip(),
        street_group=body.street_group,
        district_id=body.district_id,
        geom=geography(session, body.geometry.model_dump(), "Линия улицы"),
    )
    session.add(street)
    session.commit()
    return _street_out(session, street)


def update_street(session: Session, street_id: int, body: StreetUpdate) -> StreetOut:
    """Только переданные поля; street_group: null — снять группу."""
    street = session.get(Street, street_id)
    if street is None:
        raise not_found("Улица")
    changes = body.model_dump(include=body.model_fields_set)
    if changes.get("name") is not None:
        street.name = changes["name"].strip()
    if "street_group" in changes:
        street.street_group = changes["street_group"]
    if changes.get("district_id") is not None:
        _check_district(session, changes["district_id"])
        street.district_id = changes["district_id"]
    session.commit()
    return _street_out(session, street)


def delete_street(session: Session, street_id: int) -> None:
    street = session.get(Street, street_id)
    if street is None:
        raise not_found("Улица")
    session.delete(street)
    _commit_or_conflict(session, in_use("Улица"))


# --- Подрядчики -----------------------------------------------------------------------


def _contractor_out(session: Session, contractor: Contractor) -> ContractorOut:
    return ContractorOut(
        id=contractor.id,
        name=contractor.name,
        phone=contractor.phone,
        email=contractor.email,
        zone=as_geojson(session, "contractors", "zone", contractor.id),
        is_active=contractor.is_active,
    )


def _phone(value: str) -> str:
    phone = validators.normalize_phone(value)
    if phone is None:
        raise ApiError(422, "invalid_phone", "Телефон должен быть российским: +7XXXXXXXXXX")
    return phone


def check_zone_overlap(session: Session, zone: str, exclude_id: int | None) -> None:
    """Зоны действующих подрядчиков не пересекаются (В-19): общая граница допустима,
    общая площадь — нет. Иначе точка попала бы в две зоны сразу."""
    clash = session.execute(
        text(
            "SELECT name FROM contractors WHERE is_active AND zone IS NOT NULL AND id <> :id"
            " AND ST_Intersects(zone::geometry, ST_GeomFromEWKT(:z))"
            " AND NOT ST_Touches(zone::geometry, ST_GeomFromEWKT(:z)) ORDER BY name LIMIT 1"
        ),
        {"z": zone, "id": exclude_id or 0},
    ).scalar_one_or_none()
    if clash is not None:
        raise ApiError(
            422, "zone_overlap", f"Зона пересекается с зоной подрядчика «{clash}»", {"with": clash}
        )


def list_contractors(session: Session, is_active: bool | None) -> list[ContractorOut]:
    query = select(Contractor).order_by(Contractor.name)
    if is_active is not None:
        query = query.where(Contractor.is_active == is_active)
    return [_contractor_out(session, c) for c in session.scalars(query).all()]


def create_contractor(session: Session, body: ContractorIn) -> ContractorOut:
    zone = geography(session, body.zone.model_dump(), "Зона") if body.zone else None
    if zone:
        check_zone_overlap(session, zone, None)
    contractor = Contractor(
        name=body.name.strip(), phone=_phone(body.phone), email=body.email.strip(), zone=zone
    )
    session.add(contractor)
    _commit_or_conflict(session, ApiError(409, "name_taken", "Подрядчик с таким именем уже есть"))
    return _contractor_out(session, contractor)


def update_contractor(
    session: Session, contractor_id: int, body: ContractorUpdate
) -> ContractorOut:
    """Только переданные поля; zone: null — убрать зону (подрядчик не назначается сам)."""
    contractor = session.get(Contractor, contractor_id)
    if contractor is None:
        raise not_found("Подрядчик")
    changes = body.model_dump(include=body.model_fields_set)
    if changes.get("name") is not None:
        contractor.name = changes["name"].strip()
    if changes.get("phone") is not None:
        contractor.phone = _phone(changes["phone"])
    if changes.get("email") is not None:
        contractor.email = changes["email"].strip()
    new_zone = None
    if "zone" in changes:
        new_zone = geography(session, changes["zone"], "Зона") if changes["zone"] else None
    active = changes["is_active"] if changes.get("is_active") is not None else contractor.is_active
    # Итоговую зону проверяем до записи: и при её смене, и когда подрядчика снова включают
    if active and ("zone" in changes or changes.get("is_active")):
        final_zone = new_zone if "zone" in changes else _zone_ewkt(session, contractor.id)
        if final_zone:
            check_zone_overlap(session, final_zone, contractor.id)
    if "zone" in changes:
        contractor.zone = new_zone
    contractor.is_active = active  # В-7: неактивному ничего не назначается
    _commit_or_conflict(session, ApiError(409, "name_taken", "Подрядчик с таким именем уже есть"))
    return _contractor_out(session, contractor)


def _zone_ewkt(session: Session, contractor_id: int) -> str | None:
    return session.execute(
        text("SELECT ST_AsEWKT(zone::geometry) FROM contractors WHERE id = :id"),
        {"id": contractor_id},
    ).scalar_one_or_none()


def delete_contractor(session: Session, contractor_id: int) -> None:
    contractor = session.get(Contractor, contractor_id)
    if contractor is None:
        raise not_found("Подрядчик")
    session.delete(contractor)
    _commit_or_conflict(session, in_use("Подрядчик", ": сделайте его неактивным"))


# --- Сотрудники -----------------------------------------------------------------------

STAFF_ROLES = ("dispatcher", "contractor")  # граждане регистрируются сами


def _user_out(user: User, contractor_id: int | None) -> UserOut:
    return UserOut(
        id=user.id,
        login=user.login,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        is_active=user.is_active,
        contractor_id=contractor_id,
    )


def _strong(password: str) -> str:
    if not validators.is_strong_password(password):
        raise ApiError(
            422, "weak_password", "Пароль: не меньше 8 символов, заглавные и строчные буквы, цифры"
        )
    return password


def _check_contractor(session: Session, contractor_id: int | None) -> int:
    contractor = session.get(Contractor, contractor_id) if contractor_id else None
    if contractor is None or not contractor.is_active:
        raise ApiError(422, "contractor_required", "Укажите действующего подрядчика (UC-13)")
    return contractor.id


def _contractor_not_allowed() -> ApiError:
    return ApiError(
        422, "contractor_not_allowed", "Подрядчик указывается только для роли contractor"
    )


def list_users(
    session: Session, paging: Pagination, role: str | None, is_active: bool | None
) -> Page[UserOut]:
    where = []
    if role is not None:
        where.append(User.role == role)
    if is_active is not None:
        where.append(User.is_active == is_active)
    total = session.scalar(select(func.count()).select_from(User).where(*where))
    rows = session.execute(
        select(User, ContractorUser.contractor_id)
        .outerjoin(ContractorUser, ContractorUser.user_id == User.id)
        .where(*where)
        .order_by(User.last_name, User.first_name, User.id)
        .limit(paging.limit)
        .offset(paging.offset)
    )
    return Page(
        items=[_user_out(user, contractor_id) for user, contractor_id in rows],
        total=total,
        limit=paging.limit,
        offset=paging.offset,
    )


def create_user(session: Session, body: UserCreate) -> UserOut:
    """Сотрудник диспетчера или подрядчика (REQ-075); подрядчику нужна организация (В-8)."""
    if body.role not in STAFF_ROLES:
        raise ApiError(422, "staff_only", "Граждане регистрируются в мобильном приложении")
    login = validators.normalize_login(body.login)
    if session.scalar(select(User.id).where(User.login == login)) is not None:
        raise ApiError(409, "login_taken", "Такой логин уже занят")
    contractor_id = None
    if body.role == "contractor":
        contractor_id = _check_contractor(session, body.contractor_id)
    elif body.contractor_id is not None:
        raise _contractor_not_allowed()
    user = User(
        login=login,
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip(),
        role=body.role,
        password_hash=hash_password(_strong(body.password)),
    )
    session.add(user)
    session.flush()
    if contractor_id is not None:
        session.add(ContractorUser(user_id=user.id, contractor_id=contractor_id))
    _commit_or_conflict(session, ApiError(409, "login_taken", "Такой логин уже занят"))
    return _user_out(user, contractor_id)


def _revoke_sessions(session: Session, user_id: int) -> None:
    session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=func.now())
    )


def update_user(session: Session, user_id: int, body: UserUpdate) -> UserOut:
    """Пользователей не удаляем, а отключаем; при отключении отзываются все сессии."""
    user = session.get(User, user_id)
    if user is None:
        raise not_found("Пользователь")
    link = session.get(ContractorUser, user_id)
    changes = body.model_dump(include=body.model_fields_set)
    if changes.get("first_name") is not None:
        user.first_name = changes["first_name"].strip()
    if changes.get("last_name") is not None:
        user.last_name = changes["last_name"].strip()
    if changes.get("contractor_id") is not None:
        if link is None:
            raise _contractor_not_allowed()
        link.contractor_id = _check_contractor(session, changes["contractor_id"])
    if changes.get("is_active") is not None:
        user.is_active = changes["is_active"]
        if not user.is_active:
            _revoke_sessions(session, user.id)
    session.commit()
    return _user_out(user, link.contractor_id if link else None)


def reset_password(session: Session, user_id: int, password: str) -> None:
    """Новый пароль от диспетчера (UC-13); старые сессии сотрудника отзываются."""
    user = session.get(User, user_id)
    if user is None or user.role not in STAFF_ROLES:
        raise not_found("Сотрудник")
    user.password_hash = hash_password(_strong(password))
    _revoke_sessions(session, user.id)
    session.commit()
