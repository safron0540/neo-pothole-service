"""Подключение к базе: движок, фабрика сессий и базовый класс моделей."""

from collections.abc import Iterator

from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

# Имена ограничений одинаковые на всех машинах: alembic check их сравнивает
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


# JIT PostgreSQL выключен: тяжёлые на вид запросы (тепловая карта) он компилирует заново
# на каждом вызове, 0,2–0,5 с впустую при самом запросе в 0,1–0,2 с (замер JMeter, фаза 6-3)
engine = create_engine(
    get_settings().database_url, pool_pre_ping=True, connect_args={"options": "-c jit=off"}
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """Сессия на один запрос (зависимость FastAPI)."""
    with SessionLocal() as session:
        yield session
