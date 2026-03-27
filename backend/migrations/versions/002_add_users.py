"""add users table

Revision ID: 002
Revises: 001
Create Date: 2026-03-25 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'users',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('password_hash', sa.String(256), nullable=False),
    )


def downgrade():
    op.drop_table('users')
