def get_repair_deadline_days(category: str) -> int:
    category = category.strip().upper()
    deadlines = {
        "А": 2,
        "Б": 3,
        "В": 5,
        "Г": 10,
        "Д": 12,
    }
    return deadlines.get(category, 10)
