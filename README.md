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

Веб-панель и API за nginx: http://localhost:8080 (`NGINX_PORT`; на сервере сюда проксирует Caddy). nginx режет частые попытки входа (429), отдаёт фото по подписанной ссылке (X-Accel-Redirect) и закрывает `/metrics`. Конфиг — [`infra/nginx/nginx.conf`](infra/nginx/nginx.conf). Фото открываются только через nginx: на прямом :8000 тело фото пустое.

Swagger: http://localhost:8000/api/docs. Контракт API v1 для веба и мобильного приложения — [`docs/openapi.json`](docs/openapi.json) (запросы с ответом 501 описаны, но ещё не сделаны; после правки схем: `python -m scripts.export_openapi`). Остановить: `docker compose down` (данные базы сохраняются в томе `pgdata`; удалить их: `docker compose down -v`).

### Мониторинг

```bash
docker compose --profile monitoring up -d    # Prometheus :9090 и Grafana :3000 (только localhost)
```

Бэкенд отдаёт метрики на `/metrics` (снаружи nginx его закрывает): число запросов и время ответа по маршрутам. Дашборд «Ямочный ремонт: API» в Grafana появляется сам (`infra/grafana/`): доля запросов быстрее 1 с (ПР-2), запросы в секунду, ошибки 5xx, 95-й перцентиль по маршрутам. Пароль Grafana — `GRAFANA_PASSWORD` в `.env`. На сервере открывать через SSH-туннель: `ssh -L 3000:127.0.0.1:3000 …`.

### База и демо-данные

```bash
docker compose exec backend alembic upgrade head                # таблицы и группы улиц А–Е
docker compose exec backend python -m scripts.load_streets      # улицы из OSM (Overpass)
docker compose exec backend python -m scripts.load_roads        # все проезжие дороги и дворы (группа Е по умолчанию)
docker compose exec backend python -m scripts.load_buildings    # дома с номерами вдоль улиц
docker compose exec backend python -m scripts.seed_demo         # 3 подрядчика, диспетчер, подрядчик, гражданин, 30 заявок
docker compose exec backend python -m scripts.load_zones        # зоны подрядчиков по границам районов Томска
```

Улицы, их группы и районы задаёт `backend/scripts/street_groups.csv` (пока черновик, проверяет команда). Скрипты можно запускать повторно: строки обновляются по номеру OSM, дублей нет. Публичный Overpass бывает перегружен, скрипты повторяют запрос сами; ответ можно сохранить (`--save файл.json`) и загрузить без сети (`--file файл.json`). `seed_demo` печатает пароли новых пользователей один раз; задать свой: переменная `SEED_PASSWORD`.

### ML-сервис (заглушка)

`ml_service` в compose пока заглушка: `POST /predict` (поле `image`) отвечает `{has_pit, class, pits_count, confidence, model_version}` — предложение формата для модели (В-34). Режим задаёт `ML_STUB_MODE` в `.env`: `random` (по умолчанию, ответ зависит от фото), `big`, `small`, `no_pit`, `unavailable` (503), `slow` (ждёт дольше таймаута 8 с).

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
