"""Заявки: подача с автообработкой и просмотр гражданином. Один сценарий — одна транзакция.

Статус заявки меняет только change_status() (PR 2-6). Адрес, дом, район и группа
копируются в заявку при подаче (снимок) и потом не зависят от справочников.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import rules
from app.core.statuses import ON_REVIEW
from app.deps import Pagination
from app.errors import ApiError
from app.modules.auth.models import User
from app.modules.geo import service as geo
from app.modules.media.models import Photo
from app.modules.media.service import photo_url
from app.modules.requests.models import Request, RequestEvent
from app.modules.requests.schemas import (
    CitizenRequestOut,
    EventOut,
    RequestCreate,
    RequestSummary,
)
from app.schemas import Page, Point, StatusOut

SYSTEM_ACTOR = "Система"  # В-9
CITIZEN_EVENTS = ("created", "status_changed")  # автообработку гражданину не показываем


def not_found() -> ApiError:
    return ApiError(404, "not_found", "Заявка не найдена")


def location_of(session: Session, request_id: int) -> Point:
    lat, lon = session.execute(
        text(
            "SELECT ST_Y(location::geometry), ST_X(location::geometry) FROM requests WHERE id = :id"
        ),
        {"id": request_id},
    ).one()
    return Point(lat=lat, lon=lon)


def summary_fields(request: Request, now: datetime) -> dict:
    """Поля строки списка, общие для всех ролей; просрочка считается здесь (не хранится)."""
    return {
        "id": request.id,
        "status": StatusOut.of(request.status),
        "defect_class": request.defect_class,
        "address": request.address,
        "detected_at": request.detected_at,
        "planned_due_at": request.planned_due_at,
        "is_overdue": rules.is_overdue(request.status, request.planned_due_at, now),
    }


def actor_name(user: User | None) -> str:
    if user is None:
        return SYSTEM_ACTOR
    return f"{user.last_name} {user.first_name[:1]}.".strip()


def events_of(session: Session, request_id: int, types: tuple[str, ...] | None = None) -> list:
    query = (
        select(RequestEvent, User)
        .outerjoin(User, User.id == RequestEvent.actor_id)
        .where(RequestEvent.request_id == request_id)
        .order_by(RequestEvent.created_at, RequestEvent.id)
    )
    if types:
        query = query.where(RequestEvent.type.in_(types))
    return [
        EventOut(
            id=event.id,
            type=event.type,
            actor=actor_name(user),
            payload=event.payload,
            created_at=event.created_at,
        )
        for event, user in session.execute(query)
    ]


def add_event(
    session: Session, request_id: int, type_: str, actor_id: int | None, **payload
) -> RequestEvent:
    event = RequestEvent(request_id=request_id, actor_id=actor_id, type=type_, payload=payload)
    session.add(event)
    session.flush()
    return event


# --- Подача ----------------------------------------------------------------------------


def _class_from_photo(photo: Photo, manual_class: str | None) -> dict:
    """Класс от модели; если модель не ответила, его выбрал гражданин (REQ-022)."""
    ml = photo.ml_json or {}
    if ml.get("has_pit") and ml.get("class") in ("big", "small"):
        return {
            "defect_class": ml["class"],
            "model_class": ml["class"],
            "class_source": "model",
            "pits_count": max(int(ml.get("pits_count") or 1), 1),
        }
    if manual_class is None:
        raise ApiError(
            422, "manual_class_required", "Модель не ответила: выберите размер ямы вручную"
        )
    return {"defect_class": manual_class, "class_source": "citizen", "pits_count": 1}


def _existing(session: Session, author_id: int, client_request_id: uuid.UUID) -> Request | None:
    return session.scalar(
        select(Request).where(
            Request.author_id == author_id, Request.client_request_id == client_request_id
        )
    )


def create_request(
    session: Session, author_id: int, body: RequestCreate
) -> tuple[CitizenRequestOut, bool]:
    """Подача и автообработка (UC-03, UC-04). Возвращает заявку и признак «создана сейчас».

    Повтор с тем же client_request_id отдаёт ту же заявку (UC-03 А5, А6).
    """
    existing = _existing(session, author_id, body.client_request_id)
    if existing is not None:
        return citizen_request(session, author_id, existing.id), False

    photo = session.get(Photo, body.photo_id)
    if photo is None or photo.uploader_id != author_id:
        raise ApiError(422, "foreign_photo", "Фото не найдено: загрузите его заново")
    used = session.scalar(
        select(func.count())
        .select_from(Request)
        .where(or_(Request.before_photo_id == photo.id, Request.after_photo_id == photo.id))
    )
    if used:
        raise ApiError(409, "photo_used", "Это фото уже прикреплено к другой заявке")
    defect = _class_from_photo(photo, body.manual_class)

    lat, lon = body.location.lat, body.location.lon
    now = datetime.now(UTC)
    match = geo.match_address(session, lat, lon)
    request = Request(
        client_request_id=body.client_request_id,
        author_id=author_id,
        before_photo_id=photo.id,
        location=f"SRID=4326;POINT({lon} {lat})",
        accuracy_m=body.accuracy_m,
        address=match.address,
        house_number=match.house_number,
        district_id=match.district_id,
        street_group=match.street_group,
        street_id=match.street_id,
        segment_idx=match.segment_idx,
        status=ON_REVIEW,
        citizen_comment=body.citizen_comment,
        detected_at=now,
        planned_due_at=rules.due_at(now, geo.deadline_hours(session, match.street_group)),
        contractor_id=geo.find_contractor(session, lat, lon),
        duplicate_of_id=geo.find_duplicate(session, lat, lon, defect["defect_class"]),
        **defect,
    )
    session.add(request)
    try:
        session.flush()
    except IntegrityError:
        # Тот же client_request_id пришёл параллельно: отдаём уже созданную заявку
        session.rollback()
        existing = _existing(session, author_id, body.client_request_id)
        if existing is None:
            raise
        return citizen_request(session, author_id, existing.id), False

    add_event(session, request.id, "created", author_id, to=ON_REVIEW)
    add_event(
        session,
        request.id,
        "processed",
        None,
        street_id=match.street_id,
        house_number=match.house_number,
        street_group=match.street_group,
        contractor_id=request.contractor_id,
        duplicate_of_id=request.duplicate_of_id,
        class_source=request.class_source,
    )
    session.commit()
    return citizen_request(session, author_id, request.id), True


# --- Гражданин -------------------------------------------------------------------------


def my_requests(session: Session, author_id: int, paging: Pagination) -> Page[RequestSummary]:
    where = Request.author_id == author_id
    total = session.scalar(select(func.count()).select_from(Request).where(where))
    rows = session.scalars(
        select(Request)
        .where(where)
        .order_by(Request.detected_at.desc(), Request.id.desc())
        .limit(paging.limit)
        .offset(paging.offset)
    )
    now = datetime.now(UTC)
    return Page(
        items=[RequestSummary(**summary_fields(r, now)) for r in rows],
        total=total,
        limit=paging.limit,
        offset=paging.offset,
    )


def citizen_request(session: Session, author_id: int, request_id: int) -> CitizenRequestOut:
    """Своя заявка с фото и историей; чужая — 404, как будто её нет."""
    request = session.get(Request, request_id)
    if request is None or request.author_id != author_id:
        raise not_found()
    after_photo = request.after_photo_id
    if request.merged_into_id is not None:
        # У слитой заявки фото «после» берётся у основной (docs/architecture.md, 10.4)
        after_photo = session.scalar(
            select(Request.after_photo_id).where(Request.id == request.merged_into_id)
        )
    return CitizenRequestOut(
        **summary_fields(request, datetime.now(UTC)),
        location=location_of(session, request.id),
        citizen_comment=request.citizen_comment,
        photo_before_url=photo_url(request.before_photo_id),
        photo_after_url=photo_url(after_photo),
        history=events_of(session, request.id, CITIZEN_EVENTS),
    )
