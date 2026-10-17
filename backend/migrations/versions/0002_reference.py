"""Справочники: districts, street_groups, streets, buildings, contractors

Revision ID: 0002
Revises: 0001
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geography
from sqlalchemy.dialects.postgresql import CHAR

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "districts",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_districts"),
        sa.UniqueConstraint("name", name="uq_districts_name"),
    )

    op.create_table(
        "street_groups",
        sa.Column("code", CHAR(1), nullable=False),
        sa.Column("deadline_hours", sa.Integer(), nullable=False),
        sa.Column("max_pits", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("code", name="pk_street_groups"),
        sa.CheckConstraint("code IN ('А', 'Б', 'В', 'Г', 'Д', 'Е')", name="ck_street_groups_code"),
        sa.CheckConstraint("deadline_hours > 0", name="ck_street_groups_deadline_hours_positive"),
        sa.CheckConstraint("max_pits > 0", name="ck_street_groups_max_pits_positive"),
    )

    op.create_table(
        "streets",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("osm_id", sa.BigInteger(), nullable=True),
        sa.Column("street_group", CHAR(1), nullable=True),
        sa.Column("district_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "geom",
            Geography("LINESTRING", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_streets"),
        sa.UniqueConstraint("osm_id", name="uq_streets_osm_id"),
        sa.ForeignKeyConstraint(
            ["street_group"],
            ["street_groups.code"],
            name="fk_streets_street_group_street_groups",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["district_id"],
            ["districts.id"],
            name="fk_streets_district_id_districts",
            ondelete="RESTRICT",
        ),
    )
    op.create_index("ix_streets_geom", "streets", ["geom"], postgresql_using="gist")

    op.create_table(
        "buildings",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("osm_type", CHAR(1), nullable=False),
        sa.Column("osm_id", sa.BigInteger(), nullable=False),
        sa.Column("house_number", sa.String(20), nullable=False),
        sa.Column("geom", Geography("POINT", srid=4326, spatial_index=False), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_buildings"),
        sa.UniqueConstraint("osm_type", "osm_id", name="uq_buildings_osm_type_osm_id"),
        sa.CheckConstraint("osm_type IN ('n', 'w', 'r')", name="ck_buildings_osm_type"),
    )
    op.create_index("ix_buildings_geom", "buildings", ["geom"], postgresql_using="gist")

    op.create_table(
        "contractors",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("phone", sa.String(16), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column(
            "zone",
            Geography("MULTIPOLYGON", srid=4326, spatial_index=False),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_contractors"),
        sa.UniqueConstraint("name", name="uq_contractors_name"),
    )
    op.create_index("ix_contractors_zone", "contractors", ["zone"], postgresql_using="gist")


def downgrade() -> None:
    op.drop_table("contractors")
    op.drop_table("buildings")
    op.drop_table("streets")
    op.drop_table("street_groups")
    op.drop_table("districts")
