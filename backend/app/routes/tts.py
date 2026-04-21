import json
import struct
import urllib.request
from flask import Blueprint, request, Response, jsonify

tts_bp = Blueprint('tts', __name__)

MAGPIE_URL = 'http://localhost:8001/v1/audio/speech'
LLM_URL = 'http://localhost:8000/v1/chat/completions'
LLM_MODEL = 'Nemotron-3-Nano-30B-A3B-Q8_0.gguf'
TRANSLATE_PROMPT = (
    'Please translate numbers to the equivalent words as a speaker would, '
    'for example 1970 is nineteen seventy, and otherwise leave the text as is. '
    'Return only the translated text, no explanation.'
)
SAMPLE_RATE = 22000
CHANNELS = 1
SAMPLE_WIDTH = 2  # bytes (16-bit)


def pcm_to_wav(pcm: bytes) -> bytes:
    data_size = len(pcm)
    header = struct.pack('<4sI4s', b'RIFF', data_size + 36, b'WAVE')
    fmt = struct.pack('<4sIHHIIHH', b'fmt ', 16, 1, CHANNELS, SAMPLE_RATE,
                     SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH,
                     CHANNELS * SAMPLE_WIDTH, SAMPLE_WIDTH * 8)
    data_hdr = struct.pack('<4sI', b'data', data_size)
    return header + fmt + data_hdr + pcm


@tts_bp.route('/api/tts', methods=['POST'])
def synthesize():
    data = request.get_json()
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({'error': 'No text provided'}), 400

    voice = (data.get('voice') or 'john').strip()
    payload = json.dumps({'input': text, 'voice': voice, 'language': 'en'}).encode()
    req = urllib.request.Request(
        MAGPIE_URL,
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            pcm = resp.read()
    except Exception as e:
        return jsonify({'error': str(e)}), 502

    return Response(pcm_to_wav(pcm), content_type='audio/wav')


@tts_bp.route('/api/translate', methods=['POST'])
def translate():
    data = request.get_json()
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({'error': 'No text provided'}), 400

    payload = json.dumps({
        'model': LLM_MODEL,
        'messages': [{'role': 'user', 'content': f'{TRANSLATE_PROMPT}\n\n{text}'}],
        'max_tokens': 2000,
        'temperature': 0.3,
    }).encode()
    req = urllib.request.Request(
        LLM_URL,
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read())
            translated = result['choices'][0]['message'].get('content', '').strip()
    except Exception as e:
        return jsonify({'error': str(e)}), 502

    return jsonify({'translated': translated})
