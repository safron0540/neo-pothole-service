"""Заявки: подача с автообработкой, смена статуса, просмотр. Один сценарий — одна транзакция.

Статус заявки меняет только change_status(). Адрес, дом, район и группа копируются
в заявку при подаче (снимок) и потом не зависят от справочников.
"""

import json
import uuid
from dataclasses import replace
from datetime import UTC, datetime

from geoalchemy2 import Geography, Geometry
from sqlalchemy import case, cast, func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import rules, validators
from app.core.statuses import (
    ACCEPTED,
    DONE,
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
from app.modules.geo.models import Contractor, District, Street
from app.modules.media import service as media
from app.modules.media.models import Photo
from app.modules.media.service import photo_url
from app.modules.notifications.models import Notification
from app.modules.planned_repair import service as planned_repair
from app.modules.requests.filters import NEWEST_ORDER, PRIORITY_ORDER, RequestFilter, conditions
from app.modules.requests.models import InternalNote, Request, RequestEvent
from app.modules.requests.schemas import (
    Applicant,
    CitizenRequestOut,
    ClassChange,
    ContractorAssign,
    ContractorRequestOut,
    DispatcherRequestOut,
    DispatcherRequestSummary,
    EventOut,
    HeatFeature,
    HeatmapOut,
    HeatProperties,
    MapPoint,
    MergeRequest,
    NoteOut,
    RequestCreate,
    RequestSummary,
    StatusChange,
    StreetGroupChange,
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
    follow: bool = False,
) -> None:
    """Единственное место, где меняется статус (железное правило 1).

    Строка уже заблокирована lock(), version проверил вызывающий сценарий. Здесь —
    переход и роль, событие и уведомление; «Принято» с назначенным подрядчиком сразу
    переходит в «В работе» (REQ-043, В-6: два уведомления). Слитые заявки повторяют
    статус основной (follow=True): таблица переходов к ним не применяется (REQ-059).
    Коммит делает сценарий.
    """
    current = request.status
    if follow:
        if current == target:
            return
    elif not rules.is_transition(current, target):
        raise ApiError(
            409,
            "transition_not_allowed",
            f"Нельзя перевести заявку из «{status_label(current)}» в «{status_label(target)}»",
        )
    elif not rules.can_transition(current, target, actor_role):
        raise ApiError(403, "forbidden", "Этот переход выполняет другая роль")
    elif target == REJECTED and not (comment and comment.strip() and reject_reason):
        raise ApiError(422, "reject_reason_required", "Укажите причину отклонения и комментарий")
    elif target == ACCEPTED and request.planned_due_at is None:
        raise ApiError(
            409, "street_group_required", "Укажите группу улицы: без неё нет срока устранения"
        )

    request.status = target
    request.version += 1
    if target in (ACCEPTED, REJECTED, NEEDS_CLARIFICATION) and not follow:
        request.decision_comment = comment
        request.reject_reason = reject_reason if target == REJECTED else None
    session.flush()
    payload = {"from": current, "to": target}
    if comment:
        payload["comment"] = comment
    if target == REJECTED and not follow:
        payload["reject_reason"] = reject_reason
    if follow:
        payload["main_id"] = request.merged_into_id
    event = add_event(session, request.id, "status_changed", actor_id, **payload)
    notify_author(session, request, event)
    if REJECTED in (current, target):
        planned_repair.recalc_for_request(session, request)  # REQ-046: тот же коммит
    if follow:
        return

    for merged in session.scalars(
        select(Request).where(Request.merged_into_id == request.id).with_for_update()
    ):
        change_status(session, merged, target, actor_id, actor_role, follow=True)
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


# --- Дубликаты -------------------------------------------------------------------------


def merge(
    session: Session, actor_id: int, request_id: int, body: MergeRequest
) -> DispatcherRequestOut:
    """Слить заявку request_id в основную into_id (REQ-059).

    Глубина всегда 1: в слитую нельзя слить, а слитые в request_id переходят к основной.
    Счётчик дубликатов основной растёт, поэтому растёт и её приоритет (REQ-045).
    """
    if request_id == body.into_id:
        raise ApiError(422, "merge_into_itself", "Заявку нельзя слить саму в себя")
    # Блокируем обе строки по возрастанию id: два встречных слияния не зависнут
    locked = {r_id: lock(session, r_id) for r_id in sorted((request_id, body.into_id))}
    request, main = locked[request_id], locked[body.into_id]
    check_version(request, body.version)
    if request.merged_into_id is not None:
        raise ApiError(409, "already_merged", "Заявка уже слита с другой")
    if main.merged_into_id is not None:
        raise ApiError(409, "main_is_merged", "Основная заявка сама слита: выберите её основную")
    if request.status == DONE:
        raise ApiError(409, "request_closed", "Выполненную заявку слить нельзя")

    children = session.scalars(
        select(Request).where(Request.merged_into_id == request.id).with_for_update()
    ).all()
    for merged in (request, *children):
        merged.merged_into_id = main.id
        merged.duplicate_of_id = None
        merged.version += 1
        add_event(session, merged.id, "merged", actor_id, into_id=main.id)
    request.duplicates_count = 0
    main.duplicates_count += 1 + len(children)
    main.version += 1
    add_event(session, main.id, "merged", actor_id, merged_id=request.id)
    session.flush()
    for merged in (request, *children):
        change_status(session, merged, main.status, actor_id, "dispatcher", follow=True)
        planned_repair.recalc_for_request(session, merged)  # слитая яма больше не считается
    session.commit()
    return dispatcher_card(session, request_id)


def remove_duplicate_flag(
    session: Session, actor_id: int, request_id: int, version: int
) -> DispatcherRequestOut:
    """Пометка «возможный дубликат» оказалась ложной: снимаем её (REQ-044)."""
    request = lock(session, request_id)
    check_version(request, version)
    if request.duplicate_of_id is not None:
        add_event(
            session, request.id, "duplicate_flag_removed", actor_id, was=request.duplicate_of_id
        )
        request.duplicate_of_id = None
        request.version += 1
    session.commit()
    return dispatcher_card(session, request_id)


# --- Решения диспетчера: класс, группа, подрядчик ---------------------------------------


def change_class(
    session: Session, actor_id: int, request_id: int, body: ClassChange
) -> DispatcherRequestOut:
    """Класс правится только до принятия (В-5); рекомендация считается заново при показе."""
    request = lock(session, request_id)
    check_version(request, body.version)
    if request.status not in rules.CLASS_EDITABLE_STATUSES:
        raise ApiError(409, "class_locked", "Класс меняется только до решения по заявке")
    if body.defect_class != request.defect_class:
        add_event(
            session,
            request.id,
            "class_changed",
            actor_id,
            **{"from": request.defect_class, "to": body.defect_class},
        )
        request.defect_class = body.defect_class
        request.class_source = "dispatcher"
        request.version += 1
    session.commit()
    return dispatcher_card(session, request_id)


def change_street_group(
    session: Session, actor_id: int, request_id: int, body: StreetGroupChange
) -> DispatcherRequestOut:
    """Группа улицы до решения (REQ-057, В-3); срок пересчитывается от момента обнаружения."""
    request = lock(session, request_id)
    check_version(request, body.version)
    if request.status not in rules.GROUP_EDITABLE_STATUSES:
        raise ApiError(409, "group_locked", "Группа улицы меняется только до решения по заявке")
    if body.street_group != request.street_group:
        add_event(
            session,
            request.id,
            "group_changed",
            actor_id,
            **{"from": request.street_group, "to": body.street_group},
        )
        request.street_group = body.street_group
        request.planned_due_at = rules.due_at(
            request.detected_at, geo.deadline_hours(session, body.street_group)
        )
        request.version += 1
    session.commit()
    return dispatcher_card(session, request_id)


def assign_contractor(
    session: Session, actor_id: int, request_id: int, body: ContractorAssign
) -> DispatcherRequestOut:
    """Назначить или сменить подрядчика (REQ-058). «Принято» сразу уходит в «В работе»."""
    request = lock(session, request_id)
    check_version(request, body.version)
    if request.status in (REJECTED, DONE):
        raise ApiError(409, "request_closed", "Заявка закрыта: подрядчика уже не назначить")
    contractor = session.get(Contractor, body.contractor_id)
    if contractor is None or not contractor.is_active:
        raise ApiError(422, "contractor_inactive", "Подрядчик не найден или неактивен (В-7)")
    if contractor.id != request.contractor_id:
        add_event(
            session,
            request.id,
            "contractor_changed",
            actor_id,
            **{"from": request.contractor_id, "to": contractor.id},
        )
        request.contractor_id = contractor.id
        request.version += 1
        session.flush()
    if request.status == ACCEPTED:
        change_status(session, request, IN_PROGRESS, None, rules.SYSTEM)
    session.commit()
    return dispatcher_card(session, request_id)


def request_events(session: Session, request_id: int) -> list[EventOut]:
    if session.get(Request, request_id) is None:
        raise not_found()
    return events_of(session, request_id)


# --- Карта ------------------------------------------------------------------------------

MAP_LIMIT = 2000  # больше маркеров в окне не рисуем: при отдалении веб группирует их


def map_points(session: Session, f: RequestFilter, bbox: str) -> list[MapPoint]:
    """Заявки в видимой области (REQ-048): те же фильтры, что у списка (REQ-067).

    Маркер ставится на дорогу: в ближайшую точку найденной улицы (она не дальше 30 м).
    Настоящая GPS-точка заявки — в карточке (location).
    """
    box = validators.parse_bbox(bbox)
    if box is None:
        raise ApiError(422, "invalid_bbox", "bbox: запад,юг,восток,север в градусах")
    now = datetime.now(UTC)
    gps = cast(Request.location, Geometry)
    point = case(
        (Street.id.is_not(None), func.ST_ClosestPoint(cast(Street.geom, Geometry), gps)),
        else_=gps,
    )
    envelope = cast(func.ST_MakeEnvelope(*box, 4326), Geography)
    rows = session.execute(
        select(Request, func.ST_Y(point), func.ST_X(point), District.name, Contractor.name)
        .outerjoin(Street, Street.id == Request.street_id)
        .outerjoin(District, District.id == Request.district_id)
        .outerjoin(Contractor, Contractor.id == Request.contractor_id)
        .where(Request.location.op("&&")(envelope), *conditions(f, now))
        .order_by(*PRIORITY_ORDER)
        .limit(MAP_LIMIT)
    )
    return [
        MapPoint(
            id=r.id,
            lat=lat,
            lon=lon,
            status=r.status,
            defect_class=r.defect_class,
            is_overdue=rules.is_overdue(r.status, r.planned_due_at, now),
            address=r.address,
            street_group=r.street_group,
            district=Ref(id=r.district_id, name=district) if district else None,
            contractor=Ref(id=r.contractor_id, name=contractor) if contractor else None,
            detected_at=r.detected_at,
            planned_due_at=r.planned_due_at,
        )
        for r, lat, lon, district, contractor in rows
    ]


# --- Тепловая карта по дорогам -------------------------------------------------------------

# Кусочки дорог рядом с ямами и их «тепло»: сумма весов ям, затухающая с расстоянием
# exp(−d²/2σ²). Тепло считается по расстоянию до ямы, а не по номеру куска улицы, поэтому
# на стыках кусков OSM и на перекрёстках линия не рвётся.
HEAT_SQL = text(
    """
    WITH pits AS MATERIALIZED (
        SELECT ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography AS location, w, street_id
        FROM unnest(CAST(:lons AS float8[]), CAST(:lats AS float8[]), CAST(:ws AS float8[]),
                    CAST(:streets AS bigint[]))
            AS p(lon, lat, w, street_id)
    ), pairs AS MATERIALIZED (
        -- Яма греет свою дорогу и её продолжение с тем же названием в пределах reach:
        -- в OSM улица разрезана на куски, и тепло не должно рваться на стыках. Соседние
        -- дворы и перекрёстки не греются, иначе каждая яма задевала бы сотни проездов.
        -- Кандидаты ищутся по названию, а не по расстоянию: так их единицы, а не сотни.
        -- У безымянных дворов название общее, поэтому они греют только свой кусок.
        SELECT own.id AS street_id, p.location, p.w
        FROM pits p
        JOIN streets own ON own.id = p.street_id
        WHERE own.geom && ST_MakeEnvelope(:w, :s, :e, :n, 4326)::geography
        UNION ALL
        SELECT same.id, same.location, same.w
        FROM (
            SELECT s.id, s.geom, p.location, p.w
            FROM pits p
            JOIN streets own ON own.id = p.street_id AND own.name <> :unnamed
            JOIN streets s ON s.name = own.name AND s.id <> own.id
            OFFSET 0  -- не даёт планировщику уйти в пространственный индекс
        ) AS same
        WHERE ST_DWithin(same.geom, same.location, :reach)
          AND same.geom && ST_MakeEnvelope(:w, :s, :e, :n, 4326)::geography
    ), near AS (
        SELECT s.id, s.name, s.geom, ST_Length(s.geom) AS len
        FROM streets s
        WHERE s.id IN (SELECT street_id FROM pairs)
    ), pieces AS MATERIALIZED (
        SELECT near.id, near.name, g.i, cut.piece,
               ST_LineInterpolatePoint(cut.piece, 0.5)::geography AS mid
        FROM near,
             generate_series(0, GREATEST(CEIL(near.len / :step)::int - 1, 0)) AS g(i),
             LATERAL (SELECT ST_LineSubstring(near.geom::geometry,
                                              LEAST(g.i * :step / near.len, 1),
                                              LEAST((g.i + 1) * :step / near.len, 1))
                      AS piece) AS cut
    ), heat AS (
        SELECT pieces.id, pieces.name, pieces.i, pieces.piece,
               SUM(p.w * EXP(-POWER(ST_Distance(pieces.mid, p.location), 2)
                   / (2 * :sigma * :sigma))) AS kernel,
               COUNT(*) FILTER (WHERE ST_DWithin(pieces.mid, p.location, :sigma)) AS n,
               COALESCE(SUM(p.w) FILTER (WHERE ST_DWithin(pieces.mid, p.location, :sigma)), 0)
                   AS weight
        FROM pieces
        JOIN pairs p ON p.street_id = pieces.id AND ST_DWithin(pieces.mid, p.location, :reach)
        GROUP BY pieces.id, pieces.name, pieces.i, pieces.piece
    )
    SELECT id, name, i, ST_AsGeoJSON(piece, 6) AS geometry, kernel, n, weight
    FROM heat
    """
)


def heatmap(session: Session, f: RequestFilter, bbox: str, zoom: int) -> HeatmapOut:
    """Тепловая карта дорог (REQ-052): каждая яма «греет» дорогу вокруг себя, цвет
    кусочка — по весу ям на 100 м (rules.heat_density, rules.heat_level). Масштаб задаёт
    длину кусочков и ширину пятна. По умолчанию считаются неустранённые ямы; слитые — нет."""
    box = validators.parse_bbox(bbox)
    if box is None:
        raise ApiError(422, "invalid_bbox", "bbox: запад,юг,восток,север в градусах")
    if not f.statuses:
        f = replace(f, statuses=rules.ACTIVE_STATUSES)
    now = datetime.now(UTC)
    detail = rules.heat_detail(zoom)
    step, sigma = rules.HEAT_STEP_M[detail], rules.HEAT_SIGMA_M[detail]
    reach = 3 * sigma  # дальше вклад ямы меньше 1 %
    # Ямы чуть за краем окна тоже греют видимые дороги
    margin = reach / 60000  # ≈ градусы на широте Томска
    west, south, east, north = box
    wider = cast(
        func.ST_MakeEnvelope(west - margin, south - margin, east + margin, north + margin, 4326),
        Geography,
    )
    point = cast(Request.location, Geometry)
    weight = case(*((Request.defect_class == c, w) for c, w in rules.HEAT_WEIGHTS.items()))
    pits = session.execute(
        select(func.ST_X(point), func.ST_Y(point), weight, Request.street_id).where(
            *conditions(f, now), Request.location.op("&&")(wider)
        )
    ).all()
    features: list[HeatFeature] = []
    if pits:
        rows = session.execute(
            HEAT_SQL,
            {
                "lons": [p[0] for p in pits],
                "lats": [p[1] for p in pits],
                "ws": [float(p[2]) for p in pits],
                "streets": [p[3] for p in pits],
                "unnamed": rules.UNNAMED_ROAD,
                "w": west,
                "s": south,
                "e": east,
                "n": north,
                "reach": reach,
                "step": step,
                "sigma": sigma,
            },
        )
        for street_id, name, i, geometry, kernel, n, total in rows:
            per_100m = round(rules.heat_density(float(kernel), sigma), 2)
            level = rules.heat_level(per_100m)
            if level is None:
                continue
            features.append(
                HeatFeature(
                    geometry=json.loads(geometry),
                    properties=HeatProperties(
                        street=name,
                        street_id=street_id,
                        segment_idx=i * step // rules.SEGMENT_LENGTH_M,
                        count=int(n),
                        weight=float(total),
                        per_100m=per_100m,
                        level=level,
                    ),
                )
            )
    features.sort(key=lambda feature: feature.properties.per_100m)  # горячие рисуются поверх
    in_window = cast(func.ST_MakeEnvelope(*box, 4326), Geography)
    outside = session.scalar(
        select(func.count())
        .select_from(Request)
        .where(
            *conditions(f, now),
            Request.street_id.is_(None),
            Request.location.op("&&")(in_window),
        )
    )
    return HeatmapOut(detail=detail, features=features, outside_streets=outside)


# --- Внутренние заметки ------------------------------------------------------------------


def _note_out(note: InternalNote, author: User) -> NoteOut:
    return NoteOut(
        id=note.id,
        author=Ref(id=author.id, name=actor_name(author)),
        text=note.text,
        created_at=note.created_at,
    )


def list_notes(session: Session, request_id: int) -> list[NoteOut]:
    """Заметки видит только диспетчер (REQ-060): у гражданина и подрядчика их нет в схемах."""
    if session.get(Request, request_id) is None:
        raise not_found()
    rows = session.execute(
        select(InternalNote, User)
        .join(User, User.id == InternalNote.author_id)
        .where(InternalNote.request_id == request_id)
        .order_by(InternalNote.created_at, InternalNote.id)
    )
    return [_note_out(note, author) for note, author in rows]


def add_note(session: Session, author_id: int, request_id: int, text_: str) -> NoteOut:
    if session.get(Request, request_id) is None:
        raise not_found()
    note = InternalNote(request_id=request_id, author_id=author_id, text=text_.strip())
    session.add(note)
    session.flush()
    add_event(session, request_id, "note_added", author_id, note_id=note.id)
    session.commit()
    return _note_out(note, session.get(User, author_id))


# --- Подрядчик ----------------------------------------------------------------------------

CONTRACTOR_STATUSES = (ACCEPTED, IN_PROGRESS, DONE)


def contractor_requests(
    session: Session, contractor_id: int, paging: Pagination, overdue: bool | None
) -> Page[RequestSummary]:
    """Заявки своей организации (REQ-061): сначала в работе с ближним сроком, потом выполненные."""
    now = datetime.now(UTC)
    query = select(Request).where(
        Request.contractor_id == contractor_id,
        Request.status.in_(CONTRACTOR_STATUSES),
        Request.merged_into_id.is_(None),
    )
    if overdue is not None:
        late = Request.status.in_(rules.OVERDUE_STATUSES) & (Request.planned_due_at < now)
        query = query.where(late if overdue else ~late)
    total = session.scalar(select(func.count()).select_from(query.subquery()))
    rows = session.scalars(
        query.order_by(
            (Request.status == DONE).asc(),
            Request.planned_due_at.asc().nulls_last(),
            Request.id,
        )
        .limit(paging.limit)
        .offset(paging.offset)
    )
    return Page(
        items=[RequestSummary(**summary_fields(r, now)) for r in rows],
        total=total,
        limit=paging.limit,
        offset=paging.offset,
    )


def _own_request(session: Session, contractor_id: int, request_id: int) -> Request:
    request = session.get(Request, request_id)
    if (
        request is None
        or request.contractor_id != contractor_id
        or request.status not in CONTRACTOR_STATUSES
    ):
        raise not_found()  # чужая заявка — 404, как будто её нет
    return request


def contractor_card(session: Session, contractor_id: int, request_id: int) -> ContractorRequestOut:
    """Без данных заявителя и заметок (REQ-061)."""
    request = _own_request(session, contractor_id, request_id)
    return ContractorRequestOut(
        **summary_fields(request, datetime.now(UTC)),
        location=location_of(session, request.id),
        house_number=request.house_number,
        street_group=request.street_group,
        photo_before_url=photo_url(request.before_photo_id),
        photo_after_url=photo_url(after_photo_id(session, request)),
        completed_at=request.completed_at,
        version=request.version,
    )


def complete(
    session: Session, actor_id: int, contractor_id: int, request_id: int, data: bytes
) -> ContractorRequestOut:
    """«Выполнено»: фото «после», дата и статус одной транзакцией (REQ-063).

    Фото «после» моделью не проверяется (В-20), только формат и размер.
    """
    _own_request(session, contractor_id, request_id)
    request = lock(session, request_id)
    if request.status != IN_PROGRESS:
        raise ApiError(409, "transition_not_allowed", "Выполнить можно только заявку «В работе»")
    info = media.check_image(data)
    photo = media.save_photo(session, actor_id, data, info)
    request.after_photo_id = photo.id
    request.completed_at = datetime.now(UTC)
    change_status(session, request, DONE, actor_id, "contractor")
    session.commit()
    return contractor_card(session, contractor_id, request_id)


# --- Список заявок диспетчера ------------------------------------------------------------


def list_requests(
    session: Session, f: RequestFilter, paging: Pagination, sort: str
) -> Page[DispatcherRequestSummary]:
    """Список с фильтрами (REQ-050, 051); sort=priority — порядок REQ-045."""
    now = datetime.now(UTC)
    where = conditions(f, now)
    total = session.scalar(select(func.count()).select_from(Request).where(*where))
    order = PRIORITY_ORDER if sort == "priority" else NEWEST_ORDER
    rows = session.execute(
        select(Request, District.name, Contractor.name)
        .outerjoin(District, District.id == Request.district_id)
        .outerjoin(Contractor, Contractor.id == Request.contractor_id)
        .where(*where)
        .order_by(*order)
        .limit(paging.limit)
        .offset(paging.offset)
    )
    return Page(
        items=[
            DispatcherRequestSummary(**dispatcher_summary_fields(r, district, contractor, now))
            for r, district, contractor in rows
        ],
        total=total,
        limit=paging.limit,
        offset=paging.offset,
    )


def dispatcher_summary_fields(
    request: Request, district: str | None, contractor: str | None, now: datetime
) -> dict:
    return {
        **summary_fields(request, now),
        "street_group": request.street_group,
        "district": Ref(id=request.district_id, name=district) if district else None,
        "contractor": Ref(id=request.contractor_id, name=contractor) if contractor else None,
        "duplicates_count": request.duplicates_count,
        "duplicate_of_id": request.duplicate_of_id,
        "needs_group": request.street_group is None,
        "needs_contractor": request.contractor_id is None,
        "version": request.version,
    }


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
    district = ref(session, District, request.district_id)
    contractor = ref(session, Contractor, request.contractor_id)
    return DispatcherRequestOut(
        **dispatcher_summary_fields(
            request,
            district.name if district else None,
            contractor.name if contractor else None,
            datetime.now(UTC),
        ),
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
