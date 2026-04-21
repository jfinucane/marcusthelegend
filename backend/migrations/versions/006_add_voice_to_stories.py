"""add voice to stories

Revision ID: 006
Revises: 005
Create Date: 2026-04-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('stories', sa.Column('voice', sa.String(64), nullable=True, server_default='john'))


def downgrade():
    op.drop_column('stories', 'voice')
