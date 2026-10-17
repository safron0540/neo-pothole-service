"""Запросы к Overpass API (данные OpenStreetMap) с повторами.

Публичный сервер бывает перегружен (429, 502, 504, таймаут), поэтому запрос
повторяется с паузой. Адрес можно сменить переменной OVERPASS_URL.
"""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

OVERPASS_URL = os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter")
USER_AGENT = "neo-pothole-service/0.1 (TPU student project)"

# Демо-территория: Томск с запасом на Богашёвский тракт (юг, запад, север, восток)
TOMSK_BBOX = (56.38, 84.85, 56.56, 85.15)


def query(ql: str, attempts: int = 5, pause_seconds: float = 15.0) -> dict:
    data = urllib.parse.urlencode({"data": ql}).encode()
    request = urllib.request.Request(OVERPASS_URL, data=data, headers={"User-Agent": USER_AGENT})
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError) as error:
            # Ошибка в самом запросе (400) не исправится повтором
            client_error = isinstance(error, urllib.error.HTTPError) and error.code < 500
            if attempt == attempts or (client_error and error.code != 429):
                raise
            print(f"Overpass не ответил ({error}), попытка {attempt}/{attempts}, ждём…")
            time.sleep(pause_seconds * attempt)
    raise AssertionError("недостижимо")


def load_json(path: str) -> dict:
    """Ответ Overpass, сохранённый раньше (--file): загрузка без сети."""
    with open(path, encoding="utf-8") as file:
        return json.load(file)


def save_json(data: dict, path: str) -> None:
    with open(path, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False)
