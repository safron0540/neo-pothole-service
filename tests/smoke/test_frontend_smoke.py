import time
import pytest
import httpx

def test_frontend_index(web_client):
    # проверка index
    r = web_client.get("/")
    assert r.status_code == 200
    t = r.text
    assert "<div id=\"root\">" in t or "pothole" in t

def test_frontend_response_time(web_client):
    # время отклика веба
    t1 = time.time()
    r = web_client.get("/")
    t2 = time.time()
    assert r.status_code == 200
    assert (t2 - t1) < 1.0

def test_frontend_favicon(web_client):
    # проверка favicon
    r = web_client.get("/favicon.svg")
    if r.status_code == 404:
        r = web_client.get("/public/favicon.svg")
    assert r.status_code in [200, 304]

def test_frontend_assets(web_client):
    # проверка статики
    r = web_client.get("/index.html")
    assert r.status_code in [200, 304]
