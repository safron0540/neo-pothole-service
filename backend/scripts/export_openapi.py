"""Выгрузка контракта API в docs/openapi.json: python -m scripts.export_openapi

Файл читают веб и мобильное приложение (генерация типов). Тест
tests/contract/test_contract.py падает, если файл отстал от кода: после изменения
схем или роутеров запустите этот скрипт и закоммитьте результат.
"""

import json
from pathlib import Path

OPENAPI_PATH = Path(__file__).resolve().parents[2] / "docs" / "openapi.json"


def render() -> str:
    from app.main import app

    return json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n"


def main() -> None:
    OPENAPI_PATH.parent.mkdir(exist_ok=True)
    OPENAPI_PATH.write_text(render(), encoding="utf-8", newline="\n")
    print(f"Записано: {OPENAPI_PATH}")


if __name__ == "__main__":
    main()
