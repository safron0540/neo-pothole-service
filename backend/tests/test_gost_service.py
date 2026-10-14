from app.services.gost_service import get_repair_deadline_days


def test_category_a():
    assert get_repair_deadline_days("А") == 2


def test_category_b():
    assert get_repair_deadline_days("Б") == 3


def test_category_v():
    assert get_repair_deadline_days("В") == 5


def test_fallback_category():
    assert get_repair_deadline_days("Неизвестная") == 10
