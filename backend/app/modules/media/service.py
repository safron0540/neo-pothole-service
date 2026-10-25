"""Фото: проверка файла, хранение на диске, подписанные ссылки, анализ моделью.

Файл лежит в PHOTOS_DIR под именем {uuid}.jpg или {uuid}.png, в БД — имя файла и размеры.
Ссылка на фото подписана HMAC и живёт PHOTO_URL_MINUTES (15 мин): без входа её не подобрать.
"""

import hashlib
import hmac
import io
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from PIL import Image
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core import validators
from app.errors import ApiError
from app.modules.media.models import Photo
from app.modules.media.schemas import PhotoAnalysis
from app.modules.ml_client import client as ml_client

FORMATS = {"JPEG": ("image/jpeg", "jpg"), "PNG": ("image/png", "png")}
API_PHOTOS = "/api/v1/photos"


@dataclass(frozen=True)
class ImageInfo:
    mime_type: str
    extension: str
    width: int
    height: int


def check_image(data: bytes) -> ImageInfo:
    """Размер, формат по содержимому (а не по имени файла) и разрешение (ФТ-2, В-21)."""
    if len(data) > get_settings().photo_max_bytes:
        raise ApiError(413, "payload_too_large", "Фото больше 10 МБ")
    try:
        with Image.open(io.BytesIO(data)) as image:
            image_format, (width, height) = image.format, image.size
            image.verify()
    except Exception as error:  # Pillow бросает разные ошибки на испорченный файл
        raise ApiError(422, "invalid_image", "Файл не похож на фото JPEG или PNG") from error
    if image_format not in FORMATS:
        raise ApiError(422, "invalid_image", "Подходят только фото JPEG или PNG")
    if not validators.is_photo_resolution_ok(width, height):
        raise ApiError(
            422,
            "low_resolution",
            "Разрешение фото должно быть не меньше 1280×720",
            {"width": width, "height": height},
        )
    mime_type, extension = FORMATS[image_format]
    return ImageInfo(mime_type, extension, width, height)


def save_photo(session: Session, uploader_id: int, data: bytes, info: ImageInfo, **ml) -> Photo:
    """Пишет файл и строку photos. Коммит делает вызывающий сценарий."""
    photo_id = uuid.uuid4()
    name = f"{photo_id}.{info.extension}"
    folder = Path(get_settings().photos_dir)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_bytes(data)
    photo = Photo(
        id=photo_id,
        uploader_id=uploader_id,
        path=name,
        mime_type=info.mime_type,
        size_bytes=len(data),
        width=info.width,
        height=info.height,
        **ml,
    )
    session.add(photo)
    session.flush()
    return photo


def _signature(photo_id: uuid.UUID, expires: int) -> str:
    key = get_settings().jwt_secret.encode()
    return hmac.new(key, f"{photo_id}:{expires}".encode(), hashlib.sha256).hexdigest()[:32]


def photo_url(photo_id: uuid.UUID | None, now: datetime | None = None) -> str | None:
    if photo_id is None:
        return None
    now = now or datetime.now(UTC)
    expires = int((now + timedelta(minutes=get_settings().photo_url_minutes)).timestamp())
    return f"{API_PHOTOS}/{photo_id}?exp={expires}&sig={_signature(photo_id, expires)}"


def photo_file(session: Session, photo_id: uuid.UUID, exp: int, sig: str) -> tuple[Path, str]:
    """Файл по подписанной ссылке; неверная или просроченная подпись — 403."""
    valid = hmac.compare_digest(sig, _signature(photo_id, exp))
    if not valid or exp < datetime.now(UTC).timestamp():
        raise ApiError(403, "bad_signature", "Ссылка на фото неверна или устарела")
    photo = session.get(Photo, photo_id)
    path = Path(get_settings().photos_dir) / photo.path if photo else None
    if path is None or not path.is_file():
        raise ApiError(404, "not_found", "Фото не найдено")
    return path, photo.mime_type


def analyze(session: Session, uploader_id: int, data: bytes, filename: str) -> PhotoAnalysis:
    """Фото «до»: проверка файла и модели. Ямы нет — 422, фото не сохраняется (REQ-019)."""
    info = check_image(data)
    prediction = ml_client.predict(data, filename or f"photo.{info.extension}", info.mime_type)
    if prediction is not None and not prediction.has_pit:
        raise ApiError(422, "no_pit_detected", "Яма на фото не найдена, переснимите")
    ml = {}
    if prediction is not None:
        ml = {
            "ml_json": prediction.model_dump(mode="json", by_alias=True),
            "model_version": prediction.model_version,
        }
    photo = save_photo(session, uploader_id, data, info, **ml)
    session.commit()
    return PhotoAnalysis(
        photo_id=photo.id,
        model_unavailable=prediction is None,
        defect_class=prediction.defect_class if prediction else None,
        pits_count=max(prediction.pits_count, 1) if prediction else None,
        model_version=prediction.model_version if prediction else None,
    )
