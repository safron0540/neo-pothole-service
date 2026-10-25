"""Заявки: подача с автообработкой, смена статуса, просмотр. Один сценарий — одна транзакция.

Статус заявки меняет только change_status(). Адрес, дом, район и группа копируются
в заявку при подаче (снимок) и потом не зависят от справочников.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import rules
from app.core.statuses import (
    ACCEPTED,
    IN_PROGRESS,
    NEEDS_CLARIFICATION,
    ON_REVIEW,
    REJECTED,
    status_label,
)
from app.deps import Pagination
from app.errors import ApiError
from app.modules.auth.models import Citizen, User
from app.modules.geo import service as geo
from app.modules.geo.models import Contractor, District
from app.modules.media.models import Photo
from app.modules.media.service import photo_url
from app.modules.notifications.models import Notification
from app.modules.requests.models import Request, RequestEvent
from app.modules.requests.schemas import (
    Applicant,
    CitizenRequestOut,
    DispatcherRequestOut,
    EventOut,
    RequestCreate,
    RequestSummary,
    StatusChange,
)
from app.schemas import Page, Point, Ref, StatusOut

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


def after_photo_id(session: Session, request: Request) -> uuid.UUID | None:
    """У слитой заявки фото «после» берётся у основной (docs/architecture.md, 10.4)."""
    if request.merged_into_id is None:
        return request.after_photo_id
    return session.scalar(
        select(Request.after_photo_id).where(Request.id == request.merged_into_id)
    )


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


# --- Смена статуса ----------------------------------------------------------------------


def lock(session: Session, request_id: int) -> Request:
    """Заявка с блокировкой строки до конца транзакции (SELECT … FOR UPDATE)."""
    request = session.scalar(
        select(Request)
        .where(Request.id == request_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if request is None:
        raise not_found()
    return request


def check_version(request: Request, version: int) -> None:
    if request.version != version:
        raise ApiError(
            409,
            "version_conflict",
            "Заявку уже изменили: обновите карточку и повторите действие",
            {"version": request.version},
        )


def notify_author(session: Session, request: Request, event: RequestEvent) -> None:
    """Уведомление гражданину на каждую смену статуса (REQ-031, В-6)."""
    session.add(
        Notification(
            user_id=request.author_id,
            request_id=request.id,
            event_id=event.id,
            title=f"Заявка № {request.id}",
            body=f"Статус изменён: {status_label(request.status)}",
        )
    )


def change_status(
    session: Session,
    request: Request,
    target: str,
    actor_id: int | None,
    actor_role: str,
    comment: str | None = None,
    reject_reason: str | None = None,
) -> None:
    """Единственное место, где меняется статус (железное правило 1).

    Строка уже заблокирована lock(), version проверил вызывающий сценарий. Здесь —
    переход и роль, событие и уведомление; «Принято» с назначенным подрядчиком сразу
    переходит в «В работе» (REQ-043, В-6: два уведомления). Коммит делает сценарий.
    """
    current = request.status
    if not rules.is_transition(current, target):
        raise ApiError(
            409,
            "transition_not_allowed",
            f"Нельзя перевести заявку из «{status_label(current)}» в «{status_label(target)}»",
        )
    if not rules.can_transition(current, target, actor_role):
        raise ApiError(403, "forbidden", "Этот переход выполняет другая роль")
    if target == REJECTED and not (comment and comment.strip() and reject_reason):
        raise ApiError(422, "reject_reason_required", "Укажите причину отклонения и комментарий")
    if target == ACCEPTED and request.planned_due_at is None:
        raise ApiError(
            409, "street_group_required", "Укажите группу улицы: без неё нет срока устранения"
        )

    request.status = target
    request.version += 1
    if target in (ACCEPTED, REJECTED, NEEDS_CLARIFICATION):
        request.decision_comment = comment
        request.reject_reason = reject_reason if target == REJECTED else None
    session.flush()
    payload = {"from": current, "to": target}
    if comment:
        payload["comment"] = comment
    if target == REJECTED:
        payload["reject_reason"] = reject_reason
    event = add_event(session, request.id, "status_changed", actor_id, **payload)
    notify_author(session, request, event)

    if target == ACCEPTED and request.contractor_id is not None:
        change_status(session, request, IN_PROGRESS, None, rules.SYSTEM)


def dispatcher_change_status(
    session: Session, actor_id: int, request_id: int, body: StatusChange
) -> DispatcherRequestOut:
    """PATCH /requests/{id}/status: принять, отклонить, уточнить (UC-05)."""
    request = lock(session, request_id)
    check_version(request, body.version)
    change_status(
        session, request, body.to, actor_id, "dispatcher", body.comment, body.reject_reason
    )
    session.commit()
    return dispatcher_card(session, request_id)


# --- Карточка диспетчера -----------------------------------------------------------------


def ref(session: Session, model, object_id: int | None) -> Ref | None:
    if object_id is None:
        return None
    row = session.get(model, object_id)
    return Ref(id=row.id, name=row.name) if row else None


def dispatcher_card(session: Session, request_id: int) -> DispatcherRequestOut:
    """Полная карточка; телефон заявителя только в «Требует уточнения» (REQ-047, В-27)."""
    request = session.get(Request, request_id)
    if request is None:
        raise not_found()
    applicant = None
    if request.status == NEEDS_CLARIFICATION:
        user, phone = session.execute(
            select(User, Citizen.phone)
            .join(Citizen, Citizen.user_id == User.id)
            .where(User.id == request.author_id)
        ).one()
        applicant = Applicant(first_name=user.first_name, last_name=user.last_name, phone=phone)
    return DispatcherRequestOut(
        **summary_fields(request, datetime.now(UTC)),
        street_group=request.street_group,
        district=ref(session, District, request.district_id),
        contractor=ref(session, Contractor, request.contractor_id),
        duplicates_count=request.duplicates_count,
        duplicate_of_id=request.duplicate_of_id,
        needs_group=request.street_group is None,
        needs_contractor=request.contractor_id is None,
        location=location_of(session, request.id),
        accuracy_m=request.accuracy_m,
        house_number=request.house_number,
        street_id=request.street_id,
        model_class=request.model_class,
        class_source=request.class_source,
        pits_count=request.pits_count,
        must_fix=rules.must_fix(request.defect_class),
        recommendation=StatusOut.of(rules.recommendation(request.defect_class)),
        reject_reason=request.reject_reason,
        decision_comment=request.decision_comment,
        citizen_comment=request.citizen_comment,
        merged_into_id=request.merged_into_id,
        completed_at=request.completed_at,
        photo_before_url=photo_url(request.before_photo_id),
        photo_after_url=photo_url(after_photo_id(session, request)),
        applicant=applicant,
        version=request.version,
    )


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
    return CitizenRequestOut(
        **summary_fields(request, datetime.now(UTC)),
        location=location_of(session, request.id),
        citizen_comment=request.citizen_comment,
        photo_before_url=photo_url(request.before_photo_id),
        photo_after_url=photo_url(after_photo_id(session, request)),
        history=events_of(session, request.id, CITIZEN_EVENTS),
    )
