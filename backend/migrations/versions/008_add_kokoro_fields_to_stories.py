"""add kokoro voice and wav uuid fields to stories

Revision ID: 008
Revises: 007
Create Date: 2026-05-28 00:00:00.000000

Changes:
  - stories.kokoro_voice (String 256): selected Kokoro TTS voice for this story
  - stories.kokoro_wav_uuid (String 256): UUID of the generated WAV file on the Kokoro server
"""
from alembic import op
import sqlalchemy as sa

revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('stories', sa.Column('kokoro_voice', sa.String(256), nullable=True))
    op.add_column('stories', sa.Column('kokoro_wav_uuid', sa.String(256), nullable=True))


def downgrade():
    op.drop_column('stories', 'kokoro_wav_uuid')
    op.drop_column('stories', 'kokoro_voice')
