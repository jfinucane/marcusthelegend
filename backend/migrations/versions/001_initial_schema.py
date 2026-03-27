"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-03-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'worlds',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text, nullable=False),
        sa.Column('image_path', sa.String(512), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'stories',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('world_id', sa.String(36), sa.ForeignKey('worlds.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text, nullable=False),
        sa.Column('image_path', sa.String(512), nullable=True),
        sa.Column('order_index', sa.Integer, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'story_items',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('story_id', sa.String(36), sa.ForeignKey('stories.id', ondelete='CASCADE'), nullable=False),
        sa.Column('type', sa.String(20), nullable=False),
        sa.Column('order_index', sa.Integer, nullable=True),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('image_path', sa.String(512), nullable=True),
        sa.Column('narrative_text', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_table('story_items')
    op.drop_table('stories')
    op.drop_table('worlds')
