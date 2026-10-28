# ML-сервис: YOLO-классификатор ям на CPU. Порт 8001, POST /predict, GET /health
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app
RUN useradd --create-home --uid 1000 app

# ultralytics сама тянет opencv-python, ему нужны libGL и glib — в slim-образе их нет
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY inference ./inference

USER app
EXPOSE 8001

# Модель грузится при старте несколько секунд, поэтому start-period больше
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=2)"

CMD ["uvicorn", "inference.main:app", "--host", "0.0.0.0", "--port", "8001"]
