import io
import time
import pytest
import httpx
import PIL.Image

def make_test_photo():
    # генерация jpeg 1280x720
    img = PIL.Image.new("RGB", (1280, 720), color=(120, 120, 120))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    buf.seek(0)
    return buf

def test_ml_health(ml_client):
    # проверка health мл
    r = ml_client.get("/health")
    assert r.status_code == 200
    d = r.json()
    assert d.get("status") == "ok"
    assert "model_version" in d

def test_ml_response_time(ml_client):
    # время отклика мл
    f = make_test_photo()
    files = {"image": ("test_time.jpg", f, "image/jpeg")}
    t1 = time.time()
    r = ml_client.post("/predict", files=files)
    t2 = time.time()
    assert r.status_code == 200
    assert (t2 - t1) < 2.0

def test_ml_predict_valid(ml_client):
    # проверка predict
    f = make_test_photo()
    files = {"image": ("pothole_camera_1280x720.jpg", f, "image/jpeg")}
    r = ml_client.post("/predict", files=files)
    assert r.status_code == 200
    d = r.json()
    assert "has_pit" in d
    assert "confidence" in d
    assert "model_version" in d

def test_ml_predict_empty(ml_client):
    # пустой файл
    f = io.BytesIO(b"")
    files = {"image": ("empty.jpg", f, "image/jpeg")}
    r = ml_client.post("/predict", files=files)
    assert r.status_code == 422
