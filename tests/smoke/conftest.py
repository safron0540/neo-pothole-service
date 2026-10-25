import os
import pytest
import httpx

@pytest.fixture(scope="session")
def base_url():
    # адрес бэкенда
    return os.environ.get("BASE_URL", "http://127.0.0.1:8000")

@pytest.fixture(scope="session")
def ml_url():
    # адрес мл сервиса
    return os.environ.get("ML_URL", "http://127.0.0.1:8001")

@pytest.fixture(scope="session")
def web_url():
    # адрес веб клиента
    return os.environ.get("WEB_URL", "http://127.0.0.1:8080")

@pytest.fixture
def client(base_url):
    # клиент бэкенда
    c = httpx.Client(base_url=base_url, timeout=5.0)
    yield c
    c.close()

@pytest.fixture
def ml_client(ml_url):
    # клиент мл
    c = httpx.Client(base_url=ml_url, timeout=5.0)
    yield c
    c.close()

@pytest.fixture
def web_client(web_url):
    # клиент веба
    c = httpx.Client(base_url=web_url, timeout=5.0)
    yield c
    c.close()
