import re
import pytest
import httpx

def get_endpoints(client):
    # получение путей openapi
    r = client.get("/api/openapi.json")
    if r.status_code != 200:
        return []
    d = r.json()
    items = []
    for path, methods in d.get("paths", {}).items():
        for method in methods.keys():
            if method.lower() in ["get", "post", "put", "patch", "delete"]:
                items.append((method.upper(), path))
    return items

def test_openapi_tags(client):
    # проверка тегов
    r = client.get("/api/openapi.json")
    assert r.status_code == 200
    d = r.json()
    tags = [t["name"] for t in d.get("tags", [])]
    for exp in ["service", "auth", "citizen", "dispatcher", "contractor", "admin"]:
        assert exp in tags

def test_all_endpoints_no_500(client):
    # опрос всех эндпоинтов
    eps = get_endpoints(client)
    assert len(eps) > 0

    for method, raw_path in eps:
        # замена параметров
        p = re.sub(r"\{[a-zA-Z_]+\}", "1", raw_path)

        # отправка запроса
        if method == "GET":
            r = client.get(p)
        elif method == "POST":
            r = client.post(p, json={})
        elif method == "PUT":
            r = client.put(p, json={})
        elif method == "PATCH":
            r = client.patch(p, json={})
        elif method == "DELETE":
            r = client.delete(p)
        else:
            continue

        # проверка отсутствия 500
        assert r.status_code != 500, f"500 ошибка на {method} {p}"
        assert r.status_code in [200, 201, 204, 400, 401, 403, 404, 405, 409, 422, 501]

        # проверка формата ошибки
        if r.status_code >= 400 and r.status_code != 405:
            d = r.json()
            assert "code" in d, f"нет поля code в {method} {p}"
            assert "message" in d, f"нет поля message в {method} {p}"
