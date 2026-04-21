"""Tests for /api/tts and /api/translate proxy endpoints."""
import io
import json
import struct
from unittest.mock import patch, MagicMock


def _make_wav(num_samples=100):
    """Create a minimal valid WAV blob for testing."""
    pcm = b'\x00\x01' * num_samples  # 16-bit silence
    data_size = len(pcm)
    header = struct.pack('<4sI4s', b'RIFF', data_size + 36, b'WAVE')
    fmt = struct.pack('<4sIHHIIHH', b'fmt ', 16, 1, 1, 22000, 44000, 2, 16)
    data_hdr = struct.pack('<4sI', b'data', data_size)
    return header + fmt + data_hdr + pcm


def _fake_urlopen(pcm_bytes=None):
    """Return a mock context manager that yields a fake HTTP response."""
    pcm = pcm_bytes or (b'\x00\x01' * 50)
    mock_resp = MagicMock()
    mock_resp.read.return_value = pcm
    mock_resp.__enter__ = lambda s: s
    mock_resp.__exit__ = MagicMock(return_value=False)
    return mock_resp


class TestTTSEndpoint:
    def test_missing_text_returns_400(self, client):
        resp = client.post('/api/tts', json={})
        assert resp.status_code == 400
        assert 'error' in resp.get_json()

    def test_empty_text_returns_400(self, client):
        resp = client.post('/api/tts', json={'text': '   '})
        assert resp.status_code == 400

    def test_successful_tts_returns_wav(self, client):
        pcm = b'\x00\x01' * 100
        with patch('urllib.request.urlopen', return_value=_fake_urlopen(pcm)):
            resp = client.post('/api/tts', json={'text': 'hello world', 'voice': 'john'})
        assert resp.status_code == 200
        assert resp.content_type == 'audio/wav'
        # WAV starts with RIFF
        assert resp.data[:4] == b'RIFF'

    def test_tts_uses_default_voice(self, client):
        """When voice is omitted the request still succeeds (defaults to john)."""
        pcm = b'\x00\x01' * 50
        with patch('urllib.request.urlopen', return_value=_fake_urlopen(pcm)) as mock_open:
            resp = client.post('/api/tts', json={'text': 'test'})
        assert resp.status_code == 200
        # Confirm the payload sent to magpie contained voice=john
        call_args = mock_open.call_args
        request_obj = call_args[0][0]
        body = json.loads(request_obj.data)
        assert body['voice'] == 'john'

    def test_tts_passes_custom_voice(self, client):
        pcm = b'\x00\x01' * 50
        with patch('urllib.request.urlopen', return_value=_fake_urlopen(pcm)) as mock_open:
            resp = client.post('/api/tts', json={'text': 'test', 'voice': 'aria'})
        assert resp.status_code == 200
        body = json.loads(mock_open.call_args[0][0].data)
        assert body['voice'] == 'aria'

    def test_upstream_error_returns_502(self, client):
        with patch('urllib.request.urlopen', side_effect=Exception('connection refused')):
            resp = client.post('/api/tts', json={'text': 'hello'})
        assert resp.status_code == 502
        assert 'error' in resp.get_json()

    def test_pcm_to_wav_header(self, client):
        """Returned WAV has correct RIFF/fmt/data structure."""
        pcm = b'\x00\x01' * 220  # 220 samples = 10ms at 22kHz
        with patch('urllib.request.urlopen', return_value=_fake_urlopen(pcm)):
            resp = client.post('/api/tts', json={'text': 'hi'})
        wav = resp.data
        # RIFF chunk
        assert wav[0:4] == b'RIFF'
        # WAVE marker
        assert wav[8:12] == b'WAVE'
        # fmt sub-chunk
        assert wav[12:16] == b'fmt '
        # data sub-chunk
        assert wav[36:40] == b'data'
        # data size matches PCM length
        data_size = struct.unpack('<I', wav[40:44])[0]
        assert data_size == len(pcm)


class TestTranslateEndpoint:
    def test_missing_text_returns_400(self, client):
        resp = client.post('/api/translate', json={})
        assert resp.status_code == 400

    def test_empty_text_returns_400(self, client):
        resp = client.post('/api/translate', json={'text': ''})
        assert resp.status_code == 400

    def test_successful_translate(self, client):
        llm_response = {
            'choices': [{'message': {'content': 'nineteen seventy'}}]
        }
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps(llm_response).encode()
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch('urllib.request.urlopen', return_value=mock_resp):
            resp = client.post('/api/translate', json={'text': '1970'})

        assert resp.status_code == 200
        assert resp.get_json()['translated'] == 'nineteen seventy'

    def test_upstream_error_returns_502(self, client):
        with patch('urllib.request.urlopen', side_effect=Exception('timeout')):
            resp = client.post('/api/translate', json={'text': 'hello'})
        assert resp.status_code == 502
        assert 'error' in resp.get_json()
