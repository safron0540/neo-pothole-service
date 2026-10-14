"""Общие настройки pytest.

Всё из tests/integration и tests/e2e получает метку автоматически,
поэтому забытая метка не уронит быстрый job CI (там нет базы данных).
"""

import pytest


def pytest_collection_modifyitems(items):
    for item in items:
        parts = item.path.parts
        if "integration" in parts:
            item.add_marker(pytest.mark.integration)
        elif "e2e" in parts:
            item.add_marker(pytest.mark.e2e)
