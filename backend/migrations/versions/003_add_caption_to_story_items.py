"""add caption to story_items

Revision ID: 003
Revises: 002
Create Date: 2026-03-27 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('story_items', sa.Column('caption', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('story_items', 'caption')
