import uuid
from datetime import datetime, timezone
from . import db


def utcnow():
    return datetime.now(timezone.utc)


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
    image_path = db.Column(db.String(512), nullable=True)
    narrative_text = db.Column(db.Text, nullable=True)
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
            "image_path": self.image_path,
            "narrative_text": self.narrative_text,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
