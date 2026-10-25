"""Демо-данные: python -m scripts.seed_demo (после load_streets)

Создаёт 3 демо-подрядчиков с непересекающимися зонами, которые вместе покрывают
демо-территорию (REQ-078), первого диспетчера, сотрудника подрядчика и гражданина.
Пароль задаётся переменной SEED_PASSWORD; если её нет, для каждого нового пользователя
генерируется свой и печатается один раз. Существующих пользователей скрипт не меняет.

Затем создаёт DEMO_REQUESTS демо-заявок гражданина в случайных точках улиц. Заявки идут
через тот же сервис, что и POST /requests (автообработка заполняет адрес, группу, срок,
подрядчика и дубликаты), а часть из них диспетчер и подрядчик проводят по статусам.
Если у демо-гражданина заявки уже есть, новые не создаются.
"""

import io
import os
import secrets
import string
import uuid

from argon2 import PasswordHasher
from PIL import Image
from sqlalchemy import Connection, func, select, text
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.modules.auth.models import ContractorUser, User
from app.modules.media import service as media
from app.modules.requests import service as requests
from app.modules.requests.models import Request
from app.modules.requests.schemas import RequestCreate, StatusChange
from app.schemas import Point

CONTRACTORS = [
    ("Демо-подрядчик «Запад»", "+73822000001", "west@example.com"),
    ("Демо-подрядчик «Центр»", "+73822000002", "center@example.com"),
    ("Демо-подрядчик «Восток»", "+73822000003", "east@example.com"),
]
CONSENT_VERSION = "1.0"
ZONE_MARGIN_DEG = 0.005  # ≈ 300–550 м запаса вокруг улиц


def new_password() -> str:
    """12 символов: буквы разных регистров и цифры (БЗ-3)."""
    alphabet = string.ascii_letters + string.digits
    while True:
        password = "".join(secrets.choice(alphabet) for _ in range(12))
        if (
            any(c.islower() for c in password)
            and any(c.isupper() for c in password)
            and any(c.isdigit() for c in password)
        ):
            return password


def seed_contractors(conn: Connection) -> list[int]:
    """Прямоугольник вокруг всех улиц делится по долготе на 3 полосы — 3 зоны."""
    box = conn.execute(
        text(
            "SELECT ST_XMin(e) - :m, ST_YMin(e) - :m, ST_XMax(e) + :m, ST_YMax(e) + :m"
            " FROM (SELECT ST_Extent(geom::geometry) AS e FROM streets) s"
        ),
        {"m": ZONE_MARGIN_DEG},
    ).one()
    if box[0] is None:
        raise SystemExit("Улиц нет: сначала python -m scripts.load_streets")
    west, south, east, north = box
    step = (east - west) / len(CONTRACTORS)

    ids = []
    for i, (name, phone, email) in enumerate(CONTRACTORS):
        x1, x2 = west + step * i, west + step * (i + 1)
        zone = (
            f"SRID=4326;MULTIPOLYGON((({x1} {south}, {x2} {south}, {x2} {north},"
            f" {x1} {north}, {x1} {south})))"
        )
        ids.append(
            conn.execute(
                text(
                    "INSERT INTO contractors (name, phone, email, zone)"
                    " VALUES (:name, :phone, :email, ST_GeogFromText(:zone))"
                    " ON CONFLICT (name) DO UPDATE SET zone = EXCLUDED.zone RETURNING id"
                ),
                {"name": name, "phone": phone, "email": email, "zone": zone},
            ).scalar_one()
        )
    return ids


def ensure_user(
    conn: Connection, login: str, role: str, first: str, last: str, hasher: PasswordHasher
) -> tuple[int, str | None]:
    """Возвращает id и пароль, если пользователь создан сейчас (иначе None)."""
    existing = conn.execute(
        text("SELECT id FROM users WHERE login = :l"), {"l": login}
    ).scalar_one_or_none()
    if existing is not None:
        return existing, None
    password = os.environ.get("SEED_PASSWORD") or new_password()
    user_id = conn.execute(
        text(
            "INSERT INTO users (login, first_name, last_name, role, password_hash)"
            " VALUES (:l, :f, :s, :r, :h) RETURNING id"
        ),
        {"l": login, "f": first, "s": last, "r": role, "h": hasher.hash(password)},
    ).scalar_one()
    return user_id, password


def seed(conn: Connection) -> dict[str, str]:
    """Заполняет демо-данные. Возвращает {логин: пароль} только для новых пользователей."""
    hasher = PasswordHasher()
    contractor_ids = seed_contractors(conn)
    created: dict[str, str] = {}

    _, password = ensure_user(conn, "dispatcher", "dispatcher", "Диана", "Диспетчерова", hasher)
    if password:
        created["dispatcher"] = password

    worker, password = ensure_user(conn, "contractor1", "contractor", "Пётр", "Подрядов", hasher)
    if password:
        created["contractor1"] = password
    conn.execute(
        text(
            "INSERT INTO contractor_users (user_id, contractor_id) VALUES (:u, :c)"
            " ON CONFLICT (user_id) DO NOTHING"
        ),
        {"u": worker, "c": contractor_ids[0]},
    )

    citizen, password = ensure_user(
        conn, "citizen@example.com", "citizen", "Иван", "Гражданов", hasher
    )
    if password:
        created["citizen@example.com"] = password
    conn.execute(
        text(
            "INSERT INTO citizens (user_id, phone) VALUES (:u, '+79130000000')"
            " ON CONFLICT (user_id) DO NOTHING"
        ),
        {"u": citizen},
    )
    for kind in ("pd", "geo"):
        conn.execute(
            text(
                "INSERT INTO user_consents (user_id, kind, doc_version) VALUES (:u, :k, :v)"
                " ON CONFLICT DO NOTHING"
            ),
            {"u": citizen, "k": kind, "v": CONSENT_VERSION},
        )
    return created


DEMO_REQUESTS = 30
DEMO_NAMESPACE = uuid.UUID("7c3e1b2a-5d4f-4e6a-9b8c-0d1e2f3a4b5c")


def demo_photo(index: int) -> bytes:
    """Однотонное фото 1280×720: у каждой заявки своё, иначе 409 «фото уже использовано»."""
    shade = 40 + index * 6 % 180
    buffer = io.BytesIO()
    Image.new("RGB", (1280, 720), (shade, shade - 20, shade - 30)).save(buffer, format="JPEG")
    return buffer.getvalue()


def seed_requests(session: Session) -> int:
    """Демо-заявки через сервисы приложения. Возвращает число созданных."""

    def user_id(login: str) -> int:
        return session.scalar(select(User.id).where(User.login == login))

    citizen, dispatcher, worker = (
        user_id(login) for login in ("citizen@example.com", "dispatcher", "contractor1")
    )
    worker_contractor = session.scalar(
        select(ContractorUser.contractor_id).where(ContractorUser.user_id == worker)
    )
    if session.scalar(select(func.count()).where(Request.author_id == citizen)):
        return 0

    session.execute(text("SELECT setseed(0.42)"))  # одинаковые точки при каждой загрузке
    points = session.execute(
        text(
            "SELECT ST_Y(p), ST_X(p) FROM (SELECT ST_LineInterpolatePoint(geom::geometry,"
            " random()) AS p FROM streets ORDER BY random() LIMIT :n) s"
        ),
        {"n": DEMO_REQUESTS},
    ).all()
    for index, (lat, lon) in enumerate(points):
        defect_class = "small" if index % 3 == 0 else "big"
        data = demo_photo(index)
        ml = {"has_pit": True, "class": defect_class, "pits_count": 1, "model_version": "seed"}
        photo = media.save_photo(
            session, citizen, data, media.check_image(data), ml_json=ml, model_version="seed"
        )
        card, _ = requests.create_request(
            session,
            citizen,
            RequestCreate(
                client_request_id=uuid.uuid5(DEMO_NAMESPACE, str(index)),
                photo_id=photo.id,
                location=Point(lat=lat, lon=lon),
            ),
        )
        decide(session, card.id, index, dispatcher, worker, worker_contractor)
    return len(points)


def decide(
    session: Session, request_id: int, index: int, dispatcher: int, worker: int, contractor: int
) -> None:
    """Каждая шестая заявка остаётся на проверке, остальные проходят разные пути."""
    request = session.get(Request, request_id)
    step = index % 6
    change = None
    if step == 1:
        change = StatusChange(to="needs_clarification", version=request.version)
    elif step in (2, 3, 4) and request.defect_class == "small":
        change = StatusChange(
            to="rejected",
            version=request.version,
            reject_reason="small_pit",
            comment="Малая яма: в плановый ремонт",
        )
    elif step in (2, 3, 4) and request.planned_due_at is not None:
        change = StatusChange(to="accepted", version=request.version)
    if change is None:
        return
    try:
        card = requests.dispatcher_change_status(session, dispatcher, request_id, change)
        own = card.contractor is not None and card.contractor.id == contractor
        if step == 4 and card.status.code == "in_progress" and own:
            requests.complete(session, worker, contractor, request_id, demo_photo(index + 99))
    except ApiError as error:
        session.rollback()
        print(f"  заявка {request_id}: {error.message}")


def main() -> None:
    from app.db import engine

    with engine.begin() as conn:
        created = seed(conn)
    print(f"Подрядчиков: {len(CONTRACTORS)}; пользователи: dispatcher, contractor1, citizen@…")
    for login, password in created.items():
        print(f"  создан {login}, пароль: {password}")
    if not created:
        print("  новых пользователей нет, пароли не менялись")
    with Session(engine) as session:
        count = seed_requests(session)
    print(f"Демо-заявок создано: {count}" if count else "Демо-заявки уже есть, новые не созданы")


if __name__ == "__main__":
    main()
