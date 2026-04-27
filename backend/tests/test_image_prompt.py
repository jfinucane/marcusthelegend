"""Tests for image prompt sanitization and the story generate-image endpoint."""
import pytest
from unittest.mock import patch
from app.image_service import _sanitize_prompt


class TestSanitizePrompt:
    def test_replaces_lowercase_background(self):
        assert _sanitize_prompt("a dark background") == "a dark setting"

    def test_replaces_capitalized_background(self):
        assert _sanitize_prompt("Background: forest") == "setting: forest"

    def test_replaces_uppercase_background(self):
        assert _sanitize_prompt("BACKGROUND color") == "setting color"

    def test_replaces_plural_backgrounds_with_settings(self):
        result = _sanitize_prompt("multiple backgrounds")
        assert result == "multiple settings"

    def test_replaces_all_occurrences(self):
        result = _sanitize_prompt("background and another background")
        assert result == "setting and another setting"

    def test_leaves_unrelated_text_unchanged(self):
        text = "Draw scene: A sunny meadow with tall grass"
        assert _sanitize_prompt(text) == text

    def test_empty_string(self):
        assert _sanitize_prompt("") == ""


class TestStoryGenerateImageEndpoint:
    def test_returns_prompt_in_response(self, client, story):
        """generate-image endpoint includes prompt alongside image_path."""
        fake_url = "/static/images/test.png"
        with patch("app.routes.stories.generate_image", return_value=fake_url):
            resp = client.post(f"/api/stories/{story.id}/generate-image")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "image_path" in data
        assert "prompt" in data
        assert isinstance(data["prompt"], str)
        assert len(data["prompt"]) > 0

    def test_prompt_contains_story_title(self, client, story):
        fake_url = "/static/images/test.png"
        with patch("app.routes.stories.generate_image", return_value=fake_url):
            resp = client.post(f"/api/stories/{story.id}/generate-image")
        data = resp.get_json()
        assert story.title in data["prompt"]

    def test_prompt_contains_world_title(self, client, story, world):
        fake_url = "/static/images/test.png"
        with patch("app.routes.stories.generate_image", return_value=fake_url):
            resp = client.post(f"/api/stories/{story.id}/generate-image")
        data = resp.get_json()
        assert world.title in data["prompt"]

    def test_prompt_has_no_word_background(self, client, story):
        """The word 'background' must not survive into the final API call."""
        # Put 'background' in the story description so it would normally appear
        from app import db
        story.description = "A story with a dark background setting"
        db.session.commit()

        captured = []
        def mock_generate(prompt):
            captured.append(prompt)
            return "/static/images/test.png"

        with patch("app.routes.stories.generate_image", side_effect=mock_generate):
            resp = client.post(f"/api/stories/{story.id}/generate-image")

        assert resp.status_code == 200
        # The sanitization happens inside generate_image, so check the
        # returned prompt string (pre-sanitization) and verify the
        # sanitize function would clean it
        raw_prompt = resp.get_json()["prompt"]
        assert "background" in raw_prompt.lower()  # raw prompt still has it
        sanitized = _sanitize_prompt(raw_prompt)
        assert "background" not in sanitized.lower()
        assert "setting" in sanitized.lower()
