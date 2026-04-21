import uuid
from datetime import datetime, timezone
from werkzeug.security import generate_password_hash, check_password_hash
from . import db


def utcnow():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    password_hash = db.Column(db.String(256), nullable=False)

    @staticmethod
    def hash_password(password):
        return generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class World(db.Model):
    __tablename__ = "worlds"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=False)
    image_path = db.Column(db.String(512), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    stories = db.relationship("Story", back_populates="world", cascade="all, delete-orphan", lazy="dynamic")

    def to_dict(self, include_stories=False):
        data = {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "image_path": self.image_path,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_stories:
            data["stories"] = [s.to_dict() for s in self.stories.order_by(Story.order_index)]
        return data


class Story(db.Model):
    __tablename__ = "stories"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    world_id = db.Column(db.String(36), db.ForeignKey("worlds.id", ondelete="CASCADE"), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=False)
    image_path = db.Column(db.String(512), nullable=True)
    order_index = db.Column(db.Integer, default=0)
    voice = db.Column(db.String(64), nullable=True, default='john')
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    world = db.relationship("World", back_populates="stories")
    items = db.relationship("StoryItem", back_populates="story", cascade="all, delete-orphan", lazy="dynamic")

    def to_dict(self, include_items=False):
        data = {
            "id": self.id,
            "world_id": self.world_id,
            "title": self.title,
            "description": self.description,
            "image_path": self.image_path,
            "order_index": self.order_index,
            "voice": self.voice or 'john',
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_items:
            data["items"] = [i.to_dict() for i in self.items.order_by(StoryItem.order_index)]
        return data


class StoryItem(db.Model):
    __tablename__ = "story_items"

    VALID_TYPES = ("image_scene", "narrative")

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    story_id = db.Column(db.String(36), db.ForeignKey("stories.id", ondelete="CASCADE"), nullable=False)
    type = db.Column(db.String(20), nullable=False)
    order_index = db.Column(db.Integer, default=0)
    description = db.Column(db.Text, nullable=True)
    caption = db.Column(db.Text, nullable=True)
    image_path = db.Column(db.String(512), nullable=True)
    narrative_text = db.Column(db.Text, nullable=True)
    adjusted_text = db.Column(db.Text, nullable=True)
    voice = db.Column(db.String(64), nullable=True)
    language = db.Column(db.String(16), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    story = db.relationship("Story", back_populates="items")

    def to_dict(self):
        return {
            "id": self.id,
            "story_id": self.story_id,
            "type": self.type,
            "order_index": self.order_index,
            "description": self.description,
            "caption": self.caption,
            "image_path": self.image_path,
            "narrative_text": self.narrative_text,
            "adjusted_text": self.adjusted_text,
            "voice": self.voice,
            "language": self.language,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class ImageGenerationLog(db.Model):
    __tablename__ = "image_generation_logs"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    entity_type = db.Column(db.String(20), nullable=False)   # 'world' | 'story' | 'item'
    entity_id = db.Column(db.String(36), nullable=False)
    action = db.Column(db.String(20), nullable=False)        # 'generate' | 'edit' | 'upload'
    prompt = db.Column(db.Text, nullable=True)               # full prompt sent to Gemini; None for uploads
    result_image_path = db.Column(db.String(512), nullable=True)
    success = db.Column(db.Boolean, nullable=False)
    error_message = db.Column(db.Text, nullable=True)
    reason_code = db.Column(db.String(50), nullable=True)    # short failure code, e.g. 'gemini_error' | 'no_image_returned' | 'item_not_found' | 'invalid_type'
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)
