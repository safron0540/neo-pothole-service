"""Расширение PostGIS

Revision ID: 0001
Revises:
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")


def downgrade() -> None:
    # Расширение не удаляем: в образе postgis/postgis от него зависят postgis_topology
    # и postgis_tiger_geocoder, а наших объектов после отката 0002 в базе уже нет
    pass
