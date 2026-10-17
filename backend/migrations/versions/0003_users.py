"""Пользователи и доступ: users, профили ролей, согласия, токены; триггер check_user_role

Таблицы: users, citizens, contractor_users, user_consents, refresh_tokens, device_tokens.

Revision ID: 0003
Revises: 0002
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import CHAR

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Профиль роли можно создать только для пользователя с этой ролью:
# гражданин не станет сотрудником подрядчика, диспетчер не подаст заявку
CHECK_USER_ROLE = """
CREATE FUNCTION check_user_role() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    actual varchar(12);
BEGIN
    SELECT role INTO actual FROM users WHERE id = NEW.user_id;
    IF actual IS DISTINCT FROM TG_ARGV[0] THEN
        RAISE EXCEPTION 'check_user_role: у пользователя % роль %, для % нужна %',
            NEW.user_id, actual, TG_TABLE_NAME, TG_ARGV[0]
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$
"""


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("login", sa.String(254), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("role", sa.String(12), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("login", name="uq_users_login"),
        sa.CheckConstraint("role IN ('citizen', 'dispatcher', 'contractor')", name="ck_users_role"),
    )

    op.create_table(
        "citizens",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("phone", sa.String(16), nullable=False),
        sa.PrimaryKeyConstraint("user_id", name="pk_citizens"),
        sa.UniqueConstraint("phone", name="uq_citizens_phone"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_citizens_user_id_users", ondelete="CASCADE"
        ),
    )

    op.create_table(
        "contractor_users",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("contractor_id", sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint("user_id", name="pk_contractor_users"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_contractor_users_user_id_users", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["contractor_id"],
            ["contractors.id"],
            name="fk_contractor_users_contractor_id_contractors",
            ondelete="RESTRICT",
        ),
    )
    op.create_index("ix_contractor_users_contractor_id", "contractor_users", ["contractor_id"])

    op.create_table(
        "user_consents",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("kind", sa.String(3), nullable=False),
        sa.Column("doc_version", sa.String(20), nullable=False),
        sa.Column(
            "accepted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("user_id", "kind", "doc_version", name="pk_user_consents"),
        sa.CheckConstraint("kind IN ('pd', 'geo')", name="ck_user_consents_kind"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_user_consents_user_id_users", ondelete="CASCADE"
        ),
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("token_hash", CHAR(64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_refresh_tokens"),
        sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_refresh_tokens_user_id_users", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])

    op.create_table(
        "device_tokens",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("fcm_token", sa.String(255), nullable=False),
        sa.Column("platform", sa.String(10), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="pk_device_tokens"),
        sa.UniqueConstraint("fcm_token", name="uq_device_tokens_fcm_token"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_device_tokens_user_id_users", ondelete="CASCADE"
        ),
    )

    op.execute(CHECK_USER_ROLE)
    op.execute(
        "CREATE TRIGGER check_user_role BEFORE INSERT OR UPDATE ON citizens "
        "FOR EACH ROW EXECUTE FUNCTION check_user_role('citizen')"
    )
    op.execute(
        "CREATE TRIGGER check_user_role BEFORE INSERT OR UPDATE ON contractor_users "
        "FOR EACH ROW EXECUTE FUNCTION check_user_role('contractor')"
    )


def downgrade() -> None:
    op.drop_table("device_tokens")
    op.drop_table("refresh_tokens")
    op.drop_table("user_consents")
    op.drop_table("contractor_users")  # триггер удаляется вместе с таблицей
    op.drop_table("citizens")
    op.drop_table("users")
    op.execute("DROP FUNCTION check_user_role()")
