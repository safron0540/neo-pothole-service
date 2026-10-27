"""Бизнес-правила заявки — чистые функции без БД и системных часов.

Время всегда передаётся параметром, поэтому правила проверяются быстрыми юнит-тестами.
Таблицы и формулы — docs/architecture.md, разделы 9.1 и 9.5. Значения, которые меняет
диспетчер (сроки и пороги групп), лежат в таблице street_groups, радиусы — в настройках.
"""

import math
from datetime import datetime, timedelta

from app.core.statuses import (
    ACCEPTED,
    DONE,
    IN_PROGRESS,
    NEEDS_CLARIFICATION,
    ON_REVIEW,
    REJECTED,
)

SYSTEM = "system"  # автор действий автообработки и автоперехода в «В работе»

# Переходы строго по таблице 4 ЧТЗ (В-4): (из, в) → кто может
ALLOWED = {
    (ON_REVIEW, ACCEPTED): {"dispatcher"},
    (ON_REVIEW, REJECTED): {"dispatcher"},  # причина обязательна
    (ON_REVIEW, NEEDS_CLARIFICATION): {"dispatcher"},
    (NEEDS_CLARIFICATION, ACCEPTED): {"dispatcher"},
    (NEEDS_CLARIFICATION, REJECTED): {"dispatcher"},
    (ACCEPTED, IN_PROGRESS): {SYSTEM},  # подрядчик назначен
    (IN_PROGRESS, DONE): {"contractor"},  # с фото «после»
}

# Заявки, среди которых ищется дубликат (REQ-044): ещё не закрыты
ACTIVE_STATUSES = (ON_REVIEW, NEEDS_CLARIFICATION, ACCEPTED, IN_PROGRESS)
# Срок идёт и может быть просрочен только у принятых в работу (REQ-062)
OVERDUE_STATUSES = (ACCEPTED, IN_PROGRESS)
# Класс правится только до принятия (В-5)
CLASS_EDITABLE_STATUSES = (ON_REVIEW, NEEDS_CLARIFICATION)
# Группа нужна до решения (В-3), после принятия срок уже идёт
GROUP_EDITABLE_STATUSES = (ON_REVIEW, NEEDS_CLARIFICATION)

SEGMENT_LENGTH_M = 100  # участок улицы для планового ремонта (REQ-046)
GROUP_ORDER = ("А", "Б", "В", "Г", "Д", "Е")  # приоритет: А важнее


def can_transition(current: str, target: str, actor_role: str) -> bool:
    return actor_role in ALLOWED.get((current, target), set())


def is_transition(current: str, target: str) -> bool:
    """Переход есть в таблице ЧТЗ (неважно, кто его делает)."""
    return (current, target) in ALLOWED


def due_at(detected_at: datetime, deadline_hours: int | None) -> datetime | None:
    """Срок устранения: от момента обнаружения (регистрации) плюс срок группы (REQ-040)."""
    if deadline_hours is None:
        return None
    return detected_at + timedelta(hours=deadline_hours)


def is_overdue(status: str, planned_due_at: datetime | None, now: datetime) -> bool:
    """Просрочка не хранится: срок прошёл, а заявка ещё в работе (REQ-062)."""
    return status in OVERDUE_STATUSES and planned_due_at is not None and planned_due_at < now


def must_fix(defect_class: str) -> bool:
    """Подлежит устранению по ГОСТ: большая яма (REQ-036, В-10)."""
    return defect_class == "big"


def recommendation(defect_class: str) -> str:
    """Рекомендация диспетчеру: big → «Принято», small → «Отклонено» (REQ-037)."""
    return ACCEPTED if must_fix(defect_class) else REJECTED


def group_rank(street_group: str | None) -> int:
    """Место группы в приоритете; заявка без группы идёт после Е."""
    return GROUP_ORDER.index(street_group) if street_group in GROUP_ORDER else len(GROUP_ORDER)


def priority_key(
    defect_class: str,
    duplicates_count: int,
    street_group: str | None,
    detected_at: datetime,
    planned_due_at: datetime | None,
) -> tuple:
    """Ключ сортировки по возрастанию (REQ-045, В-11): класс (big выше) → больше дубликатов
    → группа А→Е → раньше подана → раньше плановый срок (пустой срок в конце)."""
    return (
        0 if defect_class == "big" else 1,
        -duplicates_count,
        group_rank(street_group),
        detected_at,
        planned_due_at is None,
        planned_due_at or detected_at,
    )


def segment_index(fraction: float, length_m: float) -> int:
    """Номер 100-метрового участка по доле длины линии (ST_LineLocatePoint)."""
    fraction = min(max(fraction, 0.0), 1.0)
    last = max(math.ceil(length_m / SEGMENT_LENGTH_M) - 1, 0)
    return min(math.floor(fraction * length_m / SEGMENT_LENGTH_M), last)


def format_address(street: str | None, house: str | None, district: str | None) -> str | None:
    """«улица, дом, район»; без дома «улица, район»; без улицы пусто (REQ-002, 015)."""
    if not street:
        return None
    return ", ".join(p for p in (street, house, district) if p)
