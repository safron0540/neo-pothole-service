"""Проверка и нормализация входных данных — чистые функции без БД.

Возвращают нормализованное значение или None, если значение не подходит; сообщение
об ошибке формирует сервис.
"""

import re

PHONE_DIGITS = re.compile(r"\D")
MIN_PASSWORD_LENGTH = 8


def normalize_login(value: str) -> str:
    """Логин и email храним в нижнем регистре без пробелов по краям."""
    return value.strip().lower()


def normalize_phone(value: str) -> str | None:
    """Российский номер в E.164: +7XXXXXXXXXX. «8 913…» и «7 913…» тоже принимаются."""
    digits = PHONE_DIGITS.sub("", value)
    if len(digits) == 10:
        digits = "7" + digits
    elif len(digits) == 11 and digits[0] == "8":
        digits = "7" + digits[1:]
    if len(digits) != 11 or digits[0] != "7":
        return None
    return "+" + digits


def is_strong_password(value: str) -> bool:
    """Не меньше 8 символов, буквы разных регистров и цифры (БЗ-3)."""
    return (
        len(value) >= MIN_PASSWORD_LENGTH
        and any(c.islower() for c in value)
        and any(c.isupper() for c in value)
        and any(c.isdigit() for c in value)
    )


def parse_bbox(value: str) -> tuple[float, float, float, float] | None:
    """«запад,юг,восток,север» как у Leaflet toBBoxString(); None — если не прямоугольник."""
    parts = value.split(",")
    if len(parts) != 4:
        return None
    try:
        west, south, east, north = (float(p) for p in parts)
    except ValueError:
        return None
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        return None
    return west, south, east, north


def is_photo_resolution_ok(width: int, height: int) -> bool:
    """Не меньше 1280×720 в любой ориентации (ФТ-2, CHECK photos.resolution)."""
    return max(width, height) >= 1280 and min(width, height) >= 720
