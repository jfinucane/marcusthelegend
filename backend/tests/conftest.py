import sys
import os

# Ensure backend/ is on path so `config` module resolves
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from app import create_app, db as _db
from app.models import World, Story, StoryItem


@pytest.fixture(scope='session')
def app():
    os.environ.setdefault('DATABASE_URL', 'sqlite://')
    os.environ.setdefault('GEMINI_API_KEY', 'test')

    application = create_app()
    application.config.update(
        TESTING=True,
        SQLALCHEMY_DATABASE_URI='sqlite://',
        DATABASE_URL='sqlite://',
    )
    with application.app_context():
        _db.create_all()
        yield application
        _db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def db(app):
    return _db


@pytest.fixture()
def world(db):
    w = World(title='Test World', description='A world for testing')
    db.session.add(w)
    db.session.commit()
    yield w
    db.session.delete(w)
    db.session.commit()


@pytest.fixture()
def story(db, world):
    s = Story(world_id=world.id, title='Test Story', description='A story for testing')
    db.session.add(s)
    db.session.commit()
    yield s
    db.session.delete(s)
    db.session.commit()


@pytest.fixture()
def narrative_item(db, story):
    item = StoryItem(
        story_id=story.id,
        type='narrative',
        order_index=1,
        narrative_text='Once upon a time...',
    )
    db.session.add(item)
    db.session.commit()
    yield item
    db.session.delete(item)
    db.session.commit()


@pytest.fixture()
def image_item(db, story):
    item = StoryItem(
        story_id=story.id,
        type='image_scene',
        order_index=2,
        description='A sunny meadow',
        caption='Meadow at dawn',
    )
    db.session.add(item)
    db.session.commit()
    yield item
    db.session.delete(item)
    db.session.commit()
