import os
from flask import Blueprint, jsonify, current_app

image_buckets_bp = Blueprint('image_buckets', __name__, url_prefix='/api')

_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}


@image_buckets_bp.route('/image-buckets')
def list_image_buckets():
    buckets_path = os.path.join(current_app.static_folder, 'image-buckets')
    result = []
    if not os.path.isdir(buckets_path):
        return jsonify({'buckets': []})
    for bucket_name in sorted(os.listdir(buckets_path)):
        bucket_dir = os.path.join(buckets_path, bucket_name)
        if not os.path.isdir(bucket_dir):
            continue
        files = []
        for filename in sorted(os.listdir(bucket_dir)):
            if os.path.splitext(filename)[1].lower() in _IMAGE_EXTENSIONS:
                files.append({
                    'name': filename,
                    'path': f'/static/image-buckets/{bucket_name}/{filename}',
                })
        result.append({'name': bucket_name, 'files': files})
    return jsonify({'buckets': result})
