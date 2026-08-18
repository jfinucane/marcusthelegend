"""Tests for the /api/translate proxy endpoint."""
import json
from unittest.mock import patch, MagicMock


def _fake_ollama_response(text):
    """Mock context manager yielding an Ollama /api/generate response body."""
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps({'response': text}).encode()
    mock_resp.__enter__ = lambda s: s
    mock_resp.__exit__ = MagicMock(return_value=False)
    return mock_resp


class TestTranslateEndpoint:
    def test_missing_text_returns_400(self, client):
        resp = client.post('/api/translate', json={})
        assert resp.status_code == 400

    def test_empty_text_returns_400(self, client):
        resp = client.post('/api/translate', json={'text': ''})
        assert resp.status_code == 400

    def test_successful_translate(self, client):
        with patch('urllib.request.urlopen',
                   return_value=_fake_ollama_response('nineteen seventy')):
            resp = client.post('/api/translate', json={'text': '1970'})

        assert resp.status_code == 200
        assert resp.get_json()['translated'] == 'nineteen seventy'

    def test_translate_calls_ollama_with_prompt(self, client):
        """The normalizer prompt and the source text both reach Ollama."""
        with patch('urllib.request.urlopen',
                   return_value=_fake_ollama_response('twelve')) as mock_open:
            resp = client.post('/api/translate', json={'text': '12'})

        assert resp.status_code == 200
        body = json.loads(mock_open.call_args[0][0].data)
        assert body['model'] == 'gemma4:26b'
        assert body['prompt'].endswith('\n\n12')
        assert 'nineteen seventy' in body['prompt']

    def test_upstream_error_returns_502(self, client):
        with patch('urllib.request.urlopen', side_effect=Exception('timeout')):
            resp = client.post('/api/translate', json={'text': 'hello'})
        assert resp.status_code == 502
        assert 'error' in resp.get_json()
