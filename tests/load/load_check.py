"""Быстрая проверка нагрузки без JMeter: python tests/load/load_check.py

Та же схема, что в plan.jmx: N диспетчеров одновременно открывают список заявок,
карточку, точки карты и тепловую карту города. Печатает 95-й перцентиль по запросам
и долю ответов быстрее 1 с — цифры для ПР-1, ПР-2, ПР-6.

Переменные: BASE_URL (по умолчанию http://127.0.0.1:8080/api/v1), LOGIN, PASSWORD
(диспетчер; пароль в Git не храним), USERS (50), SECONDS (60). Каждый «пользователь»
приходит со своим X-Forwarded-For, иначе nginx посчитает всех одним IP.
"""

import os
import statistics
import threading
import time
from collections import defaultdict

import httpx2

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:8080/api/v1")
USERS = int(os.environ.get("USERS", "50"))
SECONDS = int(os.environ.get("SECONDS", "60"))
CITY = "84.85,56.38,85.15,56.56"  # весь Томск
CENTER = "84.94,56.45,85.02,56.49"

SCENARIO = [
    ("Список заявок (ПР-1)", "/requests?limit=20"),
    ("Карточка заявки", "/requests/{id}"),
    ("Точки карты: город (ПР-6)", f"/map/points?bbox={CITY}"),
    ("Тепловая карта: город", f"/map/heatmap?bbox={CITY}&zoom=11"),
    ("Тепловая карта: центр", f"/map/heatmap?bbox={CENTER}&zoom=14"),
    ("Отчёт: число заявок", "/reports/count"),
]


def login(user_no: int) -> httpx2.Client:
    client = httpx2.Client(
        base_url=BASE, timeout=30, headers={"X-Forwarded-For": f"10.10.{user_no // 250}.{user_no % 250}"}
    )
    body = {"login": os.environ["LOGIN"], "password": os.environ["PASSWORD"]}
    token = client.post("/auth/staff/login", json=body).raise_for_status().json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client


def worker(user_no: int, stop: float, timings: dict, errors: dict, lock: threading.Lock) -> None:
    client = login(user_no)
    first = client.get("/requests?limit=1").json()["items"]
    request_id = first[0]["id"] if first else 1
    while time.time() < stop:
        for name, path in SCENARIO:
            started = time.perf_counter()
            response = client.get(path.format(id=request_id))
            elapsed = time.perf_counter() - started
            with lock:
                timings[name].append(elapsed)
                if response.status_code >= 400:
                    errors[name] += 1
            time.sleep(1)  # человек смотрит на экран, а не жмёт без перерыва


def p95(values: list[float]) -> float:
    return statistics.quantiles(values, n=20)[-1] if len(values) > 1 else values[0]


def main() -> None:
    timings: dict[str, list[float]] = defaultdict(list)
    errors: dict[str, int] = defaultdict(int)
    lock = threading.Lock()
    stop = time.time() + SECONDS
    threads = [
        threading.Thread(target=worker, args=(n, stop, timings, errors, lock)) for n in range(USERS)
    ]
    for thread in threads:
        thread.start()
        time.sleep(0.1)  # плавный разгон
    for thread in threads:
        thread.join()

    every = [t for values in timings.values() for t in values]
    print(f"{USERS} пользователей, {SECONDS} с, запросов {len(every)}")
    print(f"{'Запрос':32} {'шт':>6} {'p50, с':>8} {'p95, с':>8} {'ошибок':>7}")
    for name, _ in SCENARIO:
        values = timings[name]
        if values:
            median = statistics.median(values)
            print(f"{name:32} {len(values):6} {median:8.2f} {p95(values):8.2f} {errors[name]:7}")
    fast = sum(t <= 1 for t in every) / len(every)
    print(f"ПР-2: быстрее 1 с — {fast:.1%} запросов (нужно ≥ 95 %)")


if __name__ == "__main__":
    main()
