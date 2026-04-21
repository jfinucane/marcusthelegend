"""Tests for voice/TTS fields on Story and StoryItem."""
import json


class TestStoryVoice:
    def test_story_default_voice(self, client, world):
        """Newly created story has voice defaulting to 'john'."""
        resp = client.post(
            f'/api/worlds/{world.id}/stories',
            json={'title': 'Voice Test', 'description': 'desc'},
        )
        assert resp.status_code == 201
        data = resp.get_json()
        assert data['voice'] == 'john'

    def test_update_story_voice(self, client, story):
        """PUT /api/stories/<id> can update the voice field."""
        resp = client.put(f'/api/stories/{story.id}', json={'voice': 'sofia'})
        assert resp.status_code == 200
        assert resp.get_json()['voice'] == 'sofia'

    def test_update_story_voice_roundtrip(self, client, story):
        """Voice persists after update and is returned in GET."""
        client.put(f'/api/stories/{story.id}', json={'voice': 'aria'})
        resp = client.get(f'/api/stories/{story.id}')
        assert resp.status_code == 200
        assert resp.get_json()['voice'] == 'aria'

    def test_update_story_unrelated_field_does_not_reset_voice(self, client, story):
        """Updating title alone does not overwrite voice."""
        client.put(f'/api/stories/{story.id}', json={'voice': 'leo'})
        client.put(f'/api/stories/{story.id}', json={'title': 'New Title'})
        resp = client.get(f'/api/stories/{story.id}')
        assert resp.get_json()['voice'] == 'leo'


class TestStoryItemTTSFields:
    def test_item_to_dict_includes_tts_fields(self, narrative_item):
        """StoryItem.to_dict() exposes adjusted_text, voice, language."""
        d = narrative_item.to_dict()
        assert 'adjusted_text' in d
        assert 'voice' in d
        assert 'language' in d

    def test_update_item_adjusted_text(self, client, narrative_item):
        """PUT /api/items/<id> saves adjusted_text."""
        resp = client.put(
            f'/api/items/{narrative_item.id}',
            json={'adjusted_text': 'nineteen seventy'},
        )
        assert resp.status_code == 200
        assert resp.get_json()['adjusted_text'] == 'nineteen seventy'

    def test_update_item_voice(self, client, narrative_item):
        """PUT /api/items/<id> saves per-item voice."""
        resp = client.put(
            f'/api/items/{narrative_item.id}',
            json={'voice': 'jason'},
        )
        assert resp.status_code == 200
        assert resp.get_json()['voice'] == 'jason'

    def test_update_item_language(self, client, narrative_item):
        """PUT /api/items/<id> saves language field."""
        resp = client.put(
            f'/api/items/{narrative_item.id}',
            json={'language': 'en'},
        )
        assert resp.status_code == 200
        assert resp.get_json()['language'] == 'en'

    def test_update_item_all_tts_fields_at_once(self, client, image_item):
        """Multiple TTS fields can be set in a single PUT."""
        resp = client.put(
            f'/api/items/{image_item.id}',
            json={
                'adjusted_text': 'A sunny meadow',
                'voice': 'aria',
                'language': 'en',
            },
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['adjusted_text'] == 'A sunny meadow'
        assert body['voice'] == 'aria'
        assert body['language'] == 'en'

    def test_update_item_voice_null_clears_override(self, client, narrative_item):
        """Setting voice to null clears a previously set voice."""
        client.put(f'/api/items/{narrative_item.id}', json={'voice': 'sofia'})
        resp = client.put(f'/api/items/{narrative_item.id}', json={'voice': None})
        assert resp.status_code == 200
        assert resp.get_json()['voice'] is None
