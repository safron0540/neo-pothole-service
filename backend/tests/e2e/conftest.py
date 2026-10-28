"""Сквозные тесты используют те же фикстуры, что и интеграционные: база в откатываемой
транзакции и TestClient. ML-сервис подменяется: его заглушка проверяется отдельно."""

from tests.integration.conftest import client, session  # noqa: F401
