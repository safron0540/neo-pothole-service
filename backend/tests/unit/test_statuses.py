"""Статусы заявки: шесть кодов из ЧТЗ и их русские подписи (REQ-003, В-37)."""

from app.core import statuses


def test_req_003_six_statuses_with_labels():
    assert statuses.STATUSES == (
        "on_review",
        "accepted",
        "rejected",
        "needs_clarification",
        "in_progress",
        "done",
    )
    assert [statuses.status_label(code) for code in statuses.STATUSES] == [
        "На проверке",
        "Принято",
        "Отклонено",
        "Требует уточнения",
        "В работе",
        "Выполнено",
    ]


def test_status_codes_fit_db_column():
    # requests.status — varchar(20)
    assert max(len(code) for code in statuses.STATUSES) <= 20
