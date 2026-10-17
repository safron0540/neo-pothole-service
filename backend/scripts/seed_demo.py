"""Демо-данные: python -m scripts.seed_demo (после load_streets)

Создаёт 3 демо-подрядчиков с непересекающимися зонами, которые вместе покрывают
демо-территорию (REQ-078), первого диспетчера, сотрудника подрядчика и гражданина.
Пароль задаётся переменной SEED_PASSWORD; если её нет, для каждого нового пользователя
генерируется свой и печатается один раз. Существующих пользователей скрипт не меняет.

Демо-заявки появятся вместе с созданием заявок (PR 2-5): их должна заполнять
автообработка, а не скрипт.
"""

import os
import secrets
import string

from argon2 import PasswordHasher
from sqlalchemy import Connection, text

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


def main() -> None:
    from app.db import engine

    with engine.begin() as conn:
        created = seed(conn)
    print(f"Подрядчиков: {len(CONTRACTORS)}; пользователи: dispatcher, contractor1, citizen@…")
    for login, password in created.items():
        print(f"  создан {login}, пароль: {password}")
    if not created:
        print("  новых пользователей нет, пароли не менялись")


if __name__ == "__main__":
    main()
