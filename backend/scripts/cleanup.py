"""Ночная чистка: python -m scripts.cleanup (cron на сервере, раз в сутки)

1. Фото-сироты: гражданин проверил фото (POST /photos/analyze), но заявку не подал.
   Фото без ссылок из заявок старше суток удаляется вместе с файлом.
2. Refresh-токены с истёкшим сроком: они уже ничего не открывают. Отозванные, но ещё
   не истёкшие остаются — по ним ловится повторное использование украденного токена.
"""

from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

ORPHAN_AGE = timedelta(hours=24)


def cleanup(session: Session, photos_dir: str, now: datetime) -> dict[str, int]:
    paths = (
        session.execute(
            text(
                "DELETE FROM photos p WHERE p.created_at < :before"
                " AND NOT EXISTS (SELECT 1 FROM requests r"
                "   WHERE r.before_photo_id = p.id OR r.after_photo_id = p.id)"
                " RETURNING p.path"
            ),
            {"before": now - ORPHAN_AGE},
        )
        .scalars()
        .all()
    )
    tokens = session.execute(
        text("DELETE FROM refresh_tokens WHERE expires_at < :now"), {"now": now}
    ).rowcount
    session.commit()
    # Файлы — после коммита: если база откатится, файлы останутся целы
    removed = 0
    for path in paths:
        file = Path(photos_dir) / path
        if file.is_file():
            file.unlink()
            removed += 1
    return {"photos": len(paths), "files": removed, "refresh_tokens": tokens}


def main() -> None:
    from app.config import get_settings
    from app.db import SessionLocal

    with SessionLocal() as session:
        result = cleanup(session, get_settings().photos_dir, datetime.now(UTC))
    print(
        f"Чистка: фото-сирот {result['photos']} (файлов удалено {result['files']}),"
        f" истёкших refresh-токенов {result['refresh_tokens']}"
    )


if __name__ == "__main__":
    main()
