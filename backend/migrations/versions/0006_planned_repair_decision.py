"""Решение диспетчера по предложению планового ремонта (В-16)

Новые статусы: planned (включено в план), declined (оставлен точечный ремонт),
done (ремонт по плану выполнен). Кто и когда решил; с какого момента заново
считаются ямы участка после declined и done.

Revision ID: 0006
Revises: 0005
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLE = "planned_repair_proposals"


def upgrade() -> None:
    op.drop_constraint("status", TABLE, type_="check")
    op.alter_column(TABLE, "status", type_=sa.String(8), existing_type=sa.String(6))
    op.create_check_constraint(
        "status", TABLE, "status IN ('open', 'closed', 'planned', 'declined', 'done')"
    )
    op.add_column(TABLE, sa.Column("decided_at", sa.DateTime(timezone=True)))
    op.add_column(
        TABLE,
        sa.Column(
            "decided_by",
            sa.BigInteger(),
            sa.ForeignKey(
                "users.id", name="fk_planned_repair_proposals_decided_by_users", ondelete="RESTRICT"
            ),
        ),
    )
    op.add_column(TABLE, sa.Column("decision_comment", sa.String(1000)))
    op.add_column(TABLE, sa.Column("counted_since", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column(TABLE, "counted_since")
    op.drop_column(TABLE, "decision_comment")
    op.drop_constraint("fk_planned_repair_proposals_decided_by_users", TABLE, type_="foreignkey")
    op.drop_column(TABLE, "decided_by")
    op.drop_column(TABLE, "decided_at")
    op.drop_constraint("status", TABLE, type_="check")
    # Решения диспетчера в старой схеме не выразить: такие предложения считаются закрытыми
    op.execute(f"UPDATE {TABLE} SET status = 'closed' WHERE status NOT IN ('open', 'closed')")
    op.alter_column(TABLE, "status", type_=sa.String(6), existing_type=sa.String(8))
    op.create_check_constraint("status", TABLE, "status IN ('open', 'closed')")
