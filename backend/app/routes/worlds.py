from flask import Blueprint, jsonify, request
from .. import db
from ..models import World, ImageGenerationLog
from ..image_service import generate_image, edit_image, save_uploaded_file

worlds_bp = Blueprint("worlds", __name__, url_prefix="/api")


@worlds_bp.route("/worlds", methods=["GET"])
def list_worlds():
    worlds = World.query.order_by(World.created_at.desc()).all()
    return jsonify([w.to_dict() for w in worlds])


@worlds_bp.route("/worlds", methods=["POST"])
def create_world():
    data = request.get_json()
    if not data or not data.get("title") or not data.get("description"):
        return jsonify({"error": "title and description are required"}), 400
    world = World(title=data["title"], description=data["description"])
    db.session.add(world)
    db.session.commit()
    return jsonify(world.to_dict()), 201


@worlds_bp.route("/worlds/<world_id>", methods=["GET"])
def get_world(world_id):
    world = db.get_or_404(World, world_id)
    return jsonify(world.to_dict(include_stories=True))


@worlds_bp.route("/worlds/<world_id>", methods=["PUT"])
def update_world(world_id):
    world = db.get_or_404(World, world_id)
    data = request.get_json()
    if "title" in data:
        world.title = data["title"]
    if "description" in data:
        world.description = data["description"]
    db.session.commit()
    return jsonify(world.to_dict())


@worlds_bp.route("/worlds/<world_id>", methods=["DELETE"])
def delete_world(world_id):
    world = db.get_or_404(World, world_id)
    db.session.delete(world)
    db.session.commit()
    return jsonify({"message": "deleted"}), 200


@worlds_bp.route("/worlds/<world_id>/generate-image", methods=["POST"])
def generate_world_image(world_id):
    world = db.get_or_404(World, world_id)
    prompt = f"World Title: {world.title} World Description: {world.description}"
    try:
        image_url = generate_image(prompt)
        world.image_path = image_url
        log = ImageGenerationLog(entity_type="world", entity_id=world_id, action="generate",
                                 prompt=prompt, result_image_path=image_url, success=True)
        db.session.add(log)
        db.session.commit()
        return jsonify({"image_path": image_url})
    except Exception as e:
        log = ImageGenerationLog(entity_type="world", entity_id=world_id, action="generate",
                                 prompt=prompt, success=False,
                                 reason_code="gemini_error", error_message=str(e))
        db.session.add(log)
        db.session.commit()
        return jsonify({"error": str(e)}), 500


@worlds_bp.route("/worlds/<world_id>/edit-image", methods=["POST"])
def edit_world_image(world_id):
    world = db.get_or_404(World, world_id)
    if not world.image_path:
        log = ImageGenerationLog(entity_type="world", entity_id=world_id, action="edit",
                                 prompt=None, success=False, reason_code="no_image",
                                 error_message="World has no image to edit")
        db.session.add(log)
        db.session.commit()
        return jsonify({"error": "World has no image to edit"}), 400
    data = request.get_json()
    modification_text = (data.get("modification_text") or "").strip()
    if not modification_text:
        return jsonify({"error": "modification_text is required"}), 400
    try:
        image_url = edit_image(world.image_path, modification_text)
        world.image_path = image_url
        world.description = f"{world.description or ''} ({modification_text})"
        log = ImageGenerationLog(entity_type="world", entity_id=world_id, action="edit",
                                 prompt=modification_text, result_image_path=image_url, success=True)
        db.session.add(log)
        db.session.commit()
        return jsonify({"image_path": image_url, "description": world.description})
    except Exception as e:
        log = ImageGenerationLog(entity_type="world", entity_id=world_id, action="edit",
                                 prompt=modification_text, success=False,
                                 reason_code="gemini_error", error_message=str(e))
        db.session.add(log)
        db.session.commit()
        return jsonify({"error": str(e)}), 500


@worlds_bp.route("/worlds/<world_id>/upload-image", methods=["POST"])
def upload_world_image(world_id):
    world = db.get_or_404(World, world_id)
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    try:
        image_url = save_uploaded_file(file)
        world.image_path = image_url
        log = ImageGenerationLog(entity_type="world", entity_id=world_id, action="upload",
                                 prompt=None, result_image_path=image_url, success=True)
        db.session.add(log)
        db.session.commit()
        return jsonify({"image_path": image_url})
    except Exception as e:
        log = ImageGenerationLog(entity_type="world", entity_id=world_id, action="upload",
                                 prompt=None, success=False,
                                 reason_code="upload_error", error_message=str(e))
        db.session.add(log)
        db.session.commit()
        return jsonify({"error": str(e)}), 500
