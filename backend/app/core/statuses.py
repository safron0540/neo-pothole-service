"""Статусы заявки: код хранится в БД и передаётся в API, подпись показывают клиенты.

Единственное место, где коды связаны с русскими названиями из ЧТЗ (REQ-003, В-37):
поменять текст подписи можно, не трогая базу и клиентов.
"""

ON_REVIEW = "on_review"
ACCEPTED = "accepted"
REJECTED = "rejected"
NEEDS_CLARIFICATION = "needs_clarification"
IN_PROGRESS = "in_progress"
DONE = "done"

STATUS_LABELS = {
    ON_REVIEW: "На проверке",
    ACCEPTED: "Принято",
    REJECTED: "Отклонено",
    NEEDS_CLARIFICATION: "Требует уточнения",
    IN_PROGRESS: "В работе",
    DONE: "Выполнено",
}

STATUSES = tuple(STATUS_LABELS)


def status_label(code: str) -> str:
    return STATUS_LABELS[code]
