"""add dialogue_attempts to story_items

Revision ID: 009
Revises: 008
Create Date: 2026-07-12 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '009'
down_revision = '008'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'story_items',
        sa.Column('dialogue_attempts', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade():
    op.drop_column('story_items', 'dialogue_attempts')
