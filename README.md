# Информационная система «Сервис подачи заявок. Ямочный ремонт»

## Структура репозитория

backend/ — серверная часть и REST API
frontend/ — веб-приложение для диспетчера и подрядчика
mobile/ — клиентское мобильное приложение для Android
ml_service/ — сервис классификации дефектов дорожного покрытия
infra/ — конфигурация Nginx и базы данных PostgreSQL
tests/ — тестовый контур (smoke-тесты, коллекции Apache JMeter)

## Запуск одной командой (Docker)

Нужен Docker с Compose. Поднимаются база (PostgreSQL 16 + PostGIS) и backend.

```bash
cp .env.example .env                 # один раз; Windows PowerShell: copy .env.example .env
docker compose up -d --build
docker compose ps                    # db и backend в состоянии healthy
curl http://localhost:8000/api/v1/health   # Windows PowerShell: curl.exe
```

Swagger: http://localhost:8000/api/docs. Остановить: `docker compose down` (данные базы сохраняются в томе `pgdata`; удалить их: `docker compose down -v`).

## Запуск backend локально

Нужен Python 3.12.

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt

ruff check . && ruff format --check . # стиль
pytest                                # тесты
uvicorn app.main:app --reload         # http://localhost:8000/api/docs
```

Проверка живости: `GET /api/v1/health`. Настройки берутся из переменных окружения или `backend/.env` (в Git не попадает).

## Ветки и CI

- Прямые пуши в `main` запрещены: каждая задача делается в своей ветке (`feat/…`, `fix/…`, `docs/…`, `ci/…`) и вливается через Pull Request.
- PR сливается, когда зелёная проверка **CI gate** и есть одобрение ревьюера.
- После слияния в `main` стенд обновляется автоматически: CI заходит на сервер и запускает `/workspace/deploy.sh` (скрипт хранится только на сервере), затем применяет миграции и проверяет `/api/v1/health`.
