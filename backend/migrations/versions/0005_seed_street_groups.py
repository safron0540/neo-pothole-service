"""Начальные данные групп улиц А–Е: срок устранения и порог планового ремонта

Значения из docs/db-schema.md, раздел 10 (REQ-040, REQ-046). Дальше их меняет диспетчер.

Revision ID: 0005
Revises: 0004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# код группы, срок в часах, порог ям на участке 100 м
GROUPS = [
    ("А", 24, 2),
    ("Б", 72, 2),
    ("В", 120, 10),
    ("Г", 168, 16),
    ("Д", 240, 42),
    ("Е", 288, 104),
]

street_groups = sa.table(
    "street_groups",
    sa.column("code", sa.CHAR(1)),
    sa.column("deadline_hours", sa.Integer()),
    sa.column("max_pits", sa.Integer()),
)


def upgrade() -> None:
    op.bulk_insert(
        street_groups,
        [{"code": c, "deadline_hours": h, "max_pits": p} for c, h, p in GROUPS],
    )


def downgrade() -> None:
    op.execute(street_groups.delete().where(street_groups.c.code.in_([c for c, _, _ in GROUPS])))
