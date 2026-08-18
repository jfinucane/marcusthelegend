import json
import urllib.request
from flask import Blueprint, request, Response, jsonify
from .. import db
from ..dialogue_extractor import ollama_generate
from ..models import Story

tts_bp = Blueprint('tts', __name__)

KOKORO_URL = 'http://spark-b0aa:8880/v1/audio/speech'
KOKORO_DEFAULT_VOICE = 'am_echo'
TRANSLATE_PROMPT = (
    'Please translate numbers to the equivalent words as a speaker would, '
    'for example 1970 is nineteen seventy, and otherwise leave the text as is. '
    'Return only the translated text, no explanation.'
)


@tts_bp.route('/api/stories/<story_id>/kokoro-tts', methods=['POST'])
def kokoro_tts(story_id):
    story = db.get_or_404(Story, story_id)
    data = request.get_json()
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({'error': 'No text provided'}), 400

    voice = story.kokoro_voice or KOKORO_DEFAULT_VOICE
    payload = json.dumps({
        'model': 'kokoro',
        'input': text,
        'voice': voice,
        'response_format': 'wav',
    }).encode()
    req = urllib.request.Request(
        KOKORO_URL,
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            audio = resp.read()
    except Exception as e:
        return jsonify({'error': str(e)}), 502

    return Response(audio, content_type='audio/wav')


@tts_bp.route('/api/translate', methods=['POST'])
def translate():
    data = request.get_json()
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({'error': 'No text provided'}), 400

    try:
        translated = ollama_generate(f'{TRANSLATE_PROMPT}\n\n{text}', timeout=120)
    except Exception as e:
        return jsonify({'error': str(e)}), 502

    return jsonify({'translated': translated})
