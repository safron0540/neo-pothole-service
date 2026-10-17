"""Запуск миграций Alembic.

Помощники GeoAlchemy2 нужны, чтобы Alembic понимал типы PostGIS: не трогал служебные
таблицы расширения и правильно сравнивал геоколонки (docs/db-schema.md, раздел 14).
"""

from logging.config import fileConfig

from alembic import context
from geoalchemy2 import alembic_helpers
from sqlalchemy import create_engine, pool

# Импорт моделей регистрирует их таблицы в Base.metadata
import app.modules.auth.models  # noqa: F401
import app.modules.geo.models  # noqa: F401
import app.modules.media.models  # noqa: F401
import app.modules.notifications.models  # noqa: F401
import app.modules.planned_repair.models  # noqa: F401
import app.modules.requests.models  # noqa: F401
from app.config import get_settings
from app.db import Base

if context.config.config_file_name is not None:
    fileConfig(context.config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        include_object=alembic_helpers.include_object,
        process_revision_directives=alembic_helpers.writer,
        render_item=alembic_helpers.render_item,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(get_settings().database_url, poolclass=pool.NullPool)
    with engine.connect() as connection:
        # Образ postgis/postgis добавляет в search_path схемы tiger и topology со своими
        # таблицами; без этого alembic check предлагает их удалить
        connection.exec_driver_sql("SET search_path TO public")
        connection.commit()
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=alembic_helpers.include_object,
            process_revision_directives=alembic_helpers.writer,
            render_item=alembic_helpers.render_item,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
