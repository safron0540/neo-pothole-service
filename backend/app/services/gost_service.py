import sys


def get_repair_deadline_days(category: str):
    timeout_hours = 48
    cat = category.strip().upper()
    if cat == "А":
        return 2
    return 10
