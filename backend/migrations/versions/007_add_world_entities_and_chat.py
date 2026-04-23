"""add world entities and chat session fields

Revision ID: 007
Revises: 006
Create Date: 2026-04-23 00:00:00.000000

Changes:
  - New table world_entities: characters, places, items, and other reusable world-level
    assets that can be referenced by name across stories. Each entity may have an image
    tracked via the Gemini Files API (gemini_file_name / gemini_file_uploaded_at).
  - worlds.chat_history (TEXT): reserved for future world-level chat sessions.
  - stories.chat_history (TEXT): JSON array of conversation turns for the story's Gemini
    chat session. Seed messages (world context + entity images) are rebuilt at runtime and
    are NOT stored here — only the actual prompt/response turns are persisted.
  - stories.chat_image_count (INTEGER): counts images generated in the current compaction
    window. Resets to 0 after every compaction (every 5 images).
  - stories.chat_summary (TEXT): narrative summary written by the model at compaction time,
    injected into the seed when the session is next resumed.
"""
from alembic import op
import sqlalchemy as sa

revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'world_entities',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('world_id', sa.String(36), sa.ForeignKey('worlds.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('entity_type', sa.String(50), nullable=False, server_default='other'),
        sa.Column('image_path', sa.String(512), nullable=True),
        sa.Column('gemini_file_name', sa.String(255), nullable=True),
        sa.Column('gemini_file_uploaded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_world_entities_world_id', 'world_entities', ['world_id'])

    op.add_column('worlds', sa.Column('chat_history', sa.Text, nullable=True))

    op.add_column('stories', sa.Column('chat_history', sa.Text, nullable=True))
    op.add_column('stories', sa.Column('chat_image_count', sa.Integer, nullable=False, server_default='0'))
    op.add_column('stories', sa.Column('chat_summary', sa.Text, nullable=True))


def downgrade():
    op.drop_column('stories', 'chat_summary')
    op.drop_column('stories', 'chat_image_count')
    op.drop_column('stories', 'chat_history')
    op.drop_column('worlds', 'chat_history')
    op.drop_index('ix_world_entities_world_id', table_name='world_entities')
    op.drop_table('world_entities')
