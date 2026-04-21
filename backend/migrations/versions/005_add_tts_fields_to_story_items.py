"""add tts fields to story_items

Revision ID: 005
Revises: 004
Create Date: 2026-04-08 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('story_items', sa.Column('adjusted_text', sa.Text(), nullable=True))
    op.add_column('story_items', sa.Column('voice', sa.String(64), nullable=True))
    op.add_column('story_items', sa.Column('language', sa.String(16), nullable=True))


def downgrade():
    op.drop_column('story_items', 'adjusted_text')
    op.drop_column('story_items', 'voice')
    op.drop_column('story_items', 'language')
