"""Ночная чистка (фаза 6-4): фото-сироты старше суток и истёкшие refresh-токены."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import text

from scripts.cleanup import cleanup
from tests.integration.conftest import add_photo, add_request, add_user


def make_file(tmp_path, session, photo_id) -> object:
    path = session.execute(
        text("SELECT path FROM photos WHERE id = :id"), {"id": photo_id}
    ).scalar_one()
    file = tmp_path / path
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_bytes(b"jpeg")
    return file


def age(session, photo_id, hours: int) -> None:
    session.execute(
        text("UPDATE photos SET created_at = now() - make_interval(hours => :h) WHERE id = :id"),
        {"h": hours, "id": photo_id},
    )


def test_old_orphan_photo_removed_with_file(session, tmp_path):
    user = add_user(session, "citizen")["id"]
    orphan, fresh = add_photo(session, user), add_photo(session, user)
    used = add_photo(session, user)
    add_request(session, 60.0, 100.0, before_photo_id=used)
    for photo in (orphan, used):
        age(session, photo, 48)
    files = {p: make_file(tmp_path, session, p) for p in (orphan, fresh, used)}

    result = cleanup(session, str(tmp_path), datetime.now(UTC))

    left = set(
        session.execute(text("SELECT id FROM photos WHERE uploader_id = :u"), {"u": user}).scalars()
    )
    assert left == {fresh, used}  # свежая сирота ещё может стать заявкой, фото заявки — нужно
    assert not files[orphan].exists() and files[fresh].exists() and files[used].exists()
    assert result["photos"] == result["files"] == 1


def test_only_expired_refresh_tokens_removed(session, tmp_path):
    user = add_user(session, "citizen")["id"]
    now = datetime.now(UTC)
    for expires, revoked in ((now - timedelta(days=1), None), (now + timedelta(days=5), now)):
        session.execute(
            text(
                "INSERT INTO refresh_tokens (user_id, token_hash, expires_at, revoked_at)"
                " VALUES (:u, :h, :e, :r)"
            ),
            {"u": user, "h": uuid.uuid4().hex * 2, "e": expires, "r": revoked},
        )
    cleanup(session, str(tmp_path), now)
    left = (
        session.execute(
            text("SELECT revoked_at IS NOT NULL FROM refresh_tokens WHERE user_id = :u"),
            {"u": user},
        )
        .scalars()
        .all()
    )
    assert left == [True]  # отозванный, но не истёкший нужен для поиска кражи токена
