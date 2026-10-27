"""Проверка входных данных: логин, телефон, пароль, bbox, разрешение фото."""

import pytest

from app.core import validators


def test_req_008_login_lowercase():
    assert validators.normalize_login("  Ivan@Example.COM ") == "ivan@example.com"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("+7 913 123-45-67", "+79131234567"),
        ("8 (913) 123-45-67", "+79131234567"),
        ("79131234567", "+79131234567"),
        ("9131234567", "+79131234567"),
        ("+1 202 555 0100", None),
        ("12345", None),
    ],
)
def test_req_007_phone_e164(raw, expected):
    assert validators.normalize_phone(raw) == expected


@pytest.mark.parametrize(
    ("password", "ok"),
    [
        ("Secret123", True),
        ("secret123", False),
        ("SECRET123", False),
        ("Secretabc", False),
        ("Sec12", False),
    ],
)
def test_bz_3_password_strength(password, ok):
    assert validators.is_strong_password(password) is ok


def test_req_048_bbox_leaflet_order():
    assert validators.parse_bbox("84.9,56.4,85.1,56.5") == (84.9, 56.4, 85.1, 56.5)


@pytest.mark.parametrize("bad", ["84.9,56.4,85.1", "85.1,56.4,84.9,56.5", "a,b,c,d", "0,95,1,96"])
def test_req_048_bad_bbox(bad):
    assert validators.parse_bbox(bad) is None


@pytest.mark.parametrize(
    ("width", "height", "ok"),
    [
        (1280, 720, True),
        (720, 1280, True),
        (1920, 1080, True),
        (1279, 720, False),
        (1280, 719, False),
    ],
)
def test_ft_2_photo_resolution(width, height, ok):
    assert validators.is_photo_resolution_ok(width, height) is ok
