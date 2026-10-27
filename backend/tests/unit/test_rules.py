"""Правила заявки: переходы, сроки, просрочка, рекомендация, приоритет, участок, адрес."""

from datetime import UTC, datetime, timedelta

import pytest

from app.core import rules
from app.core.statuses import (
    ACCEPTED,
    DONE,
    IN_PROGRESS,
    NEEDS_CLARIFICATION,
    ON_REVIEW,
    REJECTED,
    STATUSES,
)

NOW = datetime(2026, 10, 26, 12, 0, tzinfo=UTC)


def test_req_003_transition_table_has_seven_rows():
    assert len(rules.ALLOWED) == 7


@pytest.mark.parametrize(
    ("current", "target", "role"),
    [
        (ON_REVIEW, ACCEPTED, "dispatcher"),
        (ON_REVIEW, REJECTED, "dispatcher"),
        (ON_REVIEW, NEEDS_CLARIFICATION, "dispatcher"),
        (NEEDS_CLARIFICATION, ACCEPTED, "dispatcher"),
        (NEEDS_CLARIFICATION, REJECTED, "dispatcher"),
        (ACCEPTED, IN_PROGRESS, rules.SYSTEM),
        (IN_PROGRESS, DONE, "contractor"),
    ],
)
def test_req_003_allowed_transitions(current, target, role):
    assert rules.can_transition(current, target, role)


@pytest.mark.parametrize(
    ("current", "target", "role"),
    [
        (ON_REVIEW, ACCEPTED, "contractor"),
        (ON_REVIEW, ACCEPTED, "citizen"),
        (ACCEPTED, IN_PROGRESS, "dispatcher"),  # только система при назначенном подрядчике
        (IN_PROGRESS, DONE, "dispatcher"),
        (ON_REVIEW, DONE, "contractor"),
        (IN_PROGRESS, REJECTED, "dispatcher"),  # В-4: перехода нет
    ],
)
def test_req_003_forbidden_transitions(current, target, role):
    assert not rules.can_transition(current, target, role)


@pytest.mark.parametrize("final", [REJECTED, DONE])
def test_req_003_final_statuses_have_no_exit(final):
    assert not any(rules.is_transition(final, target) for target in STATUSES)


@pytest.mark.parametrize(("hours", "expected"), [(24, 24), (72, 72), (288, 288)])
def test_req_040_due_date_from_detection(hours, expected):
    assert rules.due_at(NOW, hours) == NOW + timedelta(hours=expected)


def test_req_040_no_group_no_due_date():
    assert rules.due_at(NOW, None) is None


@pytest.mark.parametrize(
    ("status", "due_shift", "expected"),
    [
        (ACCEPTED, -1, True),
        (IN_PROGRESS, -1, True),
        (IN_PROGRESS, +1, False),
        (DONE, -1, False),
        (ON_REVIEW, -1, False),
        (REJECTED, -1, False),
    ],
)
def test_req_062_overdue(status, due_shift, expected):
    due = NOW + timedelta(seconds=due_shift)
    assert rules.is_overdue(status, due, NOW) is expected


def test_req_062_overdue_without_due_date_is_false():
    assert not rules.is_overdue(IN_PROGRESS, None, NOW)


def test_req_036_must_fix_only_big():
    assert rules.must_fix("big")
    assert not rules.must_fix("small")


def test_req_037_recommendation():
    assert rules.recommendation("big") == ACCEPTED
    assert rules.recommendation("small") == REJECTED


def test_req_045_priority_order():
    """В-11: класс → дубликаты → группа → дата подачи → плановая дата."""
    early, late = NOW - timedelta(hours=2), NOW
    rows = {
        "small_a": ("small", 5, "А", early, None),
        "big_group_v": ("big", 0, "В", early, None),
        "big_dups": ("big", 2, "Е", late, None),
        "big_group_a_late": ("big", 0, "А", late, NOW),
        "big_group_a_early": ("big", 0, "А", early, NOW + timedelta(hours=5)),
        "big_no_group": ("big", 0, None, early, None),
    }
    order = sorted(rows, key=lambda name: rules.priority_key(*rows[name]))
    assert order == [
        "big_dups",
        "big_group_a_early",
        "big_group_a_late",
        "big_group_v",
        "big_no_group",
        "small_a",
    ]


def test_req_045_due_date_breaks_ties():
    sooner = rules.priority_key("big", 0, "А", NOW, NOW + timedelta(hours=1))
    later = rules.priority_key("big", 0, "А", NOW, NOW + timedelta(hours=2))
    empty = rules.priority_key("big", 0, "А", NOW, None)
    assert sooner < later < empty


@pytest.mark.parametrize(
    ("fraction", "length", "expected"),
    [(0.0, 350, 0), (0.28, 350, 0), (0.29, 350, 1), (0.99, 350, 3), (1.0, 350, 3), (1.0, 300, 2)],
)
def test_req_046_segment_index(fraction, length, expected):
    assert rules.segment_index(fraction, length) == expected


def test_req_046_segment_of_short_street_is_zero():
    assert rules.segment_index(1.0, 40) == 0


@pytest.mark.parametrize(
    ("street", "house", "district", "expected"),
    [
        ("проспект Ленина", "15", "Советский район", "проспект Ленина, 15, Советский район"),
        ("проспект Ленина", None, "Советский район", "проспект Ленина, Советский район"),
        (None, "15", "Советский район", None),
    ],
)
def test_req_015_address(street, house, district, expected):
    assert rules.format_address(street, house, district) == expected
