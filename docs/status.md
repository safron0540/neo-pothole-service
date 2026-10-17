# Статус проекта

Состояние на **18.10.2026**. Обновляй этот файл в конце каждого PR: что слито, что дальше.

## Что уже есть

**`main` (`0ee17d3`, PR #97 от Егора)** — пустой каркас монорепо: папки `backend/`, `ml_service/`, `infra/`, `tests/` с `.gitkeep`, `README.md`, шаблон PR с Definition of Done, `.github/ISSUE_TEMPLATE/bug_report.md`, `ci.yml` с деплоем на сервер. Кода бэкенда в `main` пока нет. Защита `main` включена: PR требует одобрения и зелёной проверки `CI gate`.

**PR 1-1 `ci/bootstrap` открыт 17.10** («feat(backend): каркас бэкенда и проверка /api/v1/health»), 7 коммитов поверх `0ee17d3`. CI зелёный (7 проверок, деплой на PR пропускается), ждёт ревью Егора.

1. `chore: каталоги backend/app и tests, дополнить .gitignore`
2. `chore: pyproject.toml и зависимости backend`
3. `feat(app): приложение FastAPI, настройки и GET /api/v1/health`
4. `test(health): дымовые тесты API и настроек, автометки в conftest`
5. `chore(docker): Dockerfile и .dockerignore backend`
6. `ci: проверка /api/v1/health в деплое, убрать script_stop`
7. `docs: шаблон PR и запуск backend в README`

Локальная проверка: `ruff check` и `ruff format --check` чистые, 5 тестов зелёные, порог покрытия 60 % проходит (в `core/` и `service.py` пока 0 строк, настоящая цифра появится с PR 2-1). Docker-образ собирается, контейнер `healthy`, `/api/v1/health` → `{"status":"ok","version":"0.1.0"}`.

Что в ветке:

- `backend/app/main.py` — FastAPI, `GET /api/v1/health` → `{"status": "ok", "version": "0.1.0"}`, Swagger `/api/docs`.
- `backend/app/config.py` — `Settings` из `.env`: `DATABASE_URL`, `JWT_SECRET` (в `prod` запрещён секрет по умолчанию), `JWT_ACCESS_MINUTES`, `JWT_REFRESH_DAYS`, `PHOTOS_DIR`, `ML_URL`, `ML_TIMEOUT_SECONDS`.
- `backend/pyproject.toml` — ruff (py312, длина строки 100, правила E F I B UP), pytest (метки integration / e2e / slow), coverage только по `core/` и `service.py`.
- `backend/requirements.txt`: fastapi 0.143.0, uvicorn[standard] 0.54.0, pydantic 2.14.1, pydantic-settings 2.15.0. `requirements-dev.txt`: ruff 0.17.0, pytest 9.1.1, pytest-cov 7.1.0, httpx2 2.13.1.
- `backend/Dockerfile` — `python:3.12-slim`, пользователь без root, HEALTHCHECK на `/api/v1/health`.

**Ветка `feat/compose-stack` (PR 1-3) запушена 18.10**, PR откроем после слияния 1-1 (ветка сделана от `ci/bootstrap`, после слияния переносится на `main`). Внутри `docker-compose.yml` в корне (`db` — postgis/postgis:16-3.4, `backend`; порты только на localhost), `.env.example` в корне, раздел README «Запуск одной командой». Проверено: `docker compose up -d --build` → оба сервиса `healthy`, health отвечает, PostGIS 3.4 в базе.

**Ветка `docs/project-documents` (PR 1-2)** — этот пакет документов в `docs/`.

## Что сделать прямо сейчас

1. Получить ревью Егора на PR 1-1 и слить его (Squash and merge). Сливает человек.
2. Проверить, что деплой после слияния прошёл (вкладка Actions → job `Deploy to Server`).
3. Перенести `feat/compose-stack` на `main` и открыть PR 1-3; открыть PR 1-2.

## Что дальше по плану

Фаза 1 по календарю (06–12.10) уже прошла, фаза 2 (13–26.10) идёт. PR фазы 1 по порядку:

| PR | Ветка | Суть | Состояние |
| --- | --- | --- | --- |
| 1-1 | `ci/bootstrap` | Каркас бэкенда, health, CI | PR открыт, ждёт ревью |
| 1-2 | `docs/project-documents` | Документы в `docs/` | ветка запушена |
| 1-3 | `feat/compose-stack` | `docker-compose.yml`: `db` и `backend`; `.env.example`; README | ветка запушена |
| 1-4 | `feat/db-reference` | Alembic + geoalchemy2 helpers, `0001_postgis`, `0002_reference` | ветка запушена, 6 тестов |
| 1-5 | `feat/db-users` | `0003_users`, триггер `check_user_role` | ветка запушена, 8 тестов |
| 1-6 | `feat/db-requests` | `0004_requests`: CHECK, индексы, триггеры; решения группы 1 — [D] по рекомендации | ветка запушена, 28 тестов |
| 1-7 | `feat/seed-street-data` | `0005_seed_street_groups`, загрузка улиц и домов из OSM, `seed_demo.py` | |
| 1-8 | `feat/ml-stub` | Заглушка в `ml_service/` и сервис в compose | |
| 1-9 | `docs/openapi-v1` | Схемы Pydantic, заглушки роутеров (501), `openapi.json`, контрактные тесты, тег `v0.1.0` | |

Полный план с коммитами по каждому PR — `docs/dev-plan.md`.

## Что блокирует

- **Вопросы группы 1 (В-1…В-10)** приняты по рекомендации как [D] (18.10, PR 1-6), команда должна подтвердить или возразить до 26.10. Если решат иначе — новая миграция `0006_…` (на схему влияют только В-2, В-3, В-7).
- **Ревьюер бэкенда не назначен.** Без него правило «одно одобрение» не выполнить. Пока ревьюит Егор.
- **Формат ответа ML** (В-34) не согласован с ML-разработчиком: нужен до PR 2-3.
- **Разметка `street_groups.csv`** и проверка покрытия домов в OSM по Томску (В-35): нужен ответственный, срок был до 19.10.

## Окружение разработчика

- Windows, проект в `D:\project\neo-pothole-service`.
- Python 3.12.10 установлен через Python Install Manager (рядом стоит 3.14: для бэкенда использовать только 3.12, venv создавать через `py -V:3.12 -m venv .venv` или полным путём к python 3.12).
- Git: почта для коммитов `artem-berdnikov-95@mail.ru` (привязана к GitHub `ArtemBerdnikov3234`). Если `git clone`/`git push` падает с ошибкой TLS (schannel), попробовать `git config --global http.sslBackend openssl`.
- Docker Desktop установлен (`docker compose` работает). В PowerShell вместо `curl` с флагами использовать `curl.exe`.
