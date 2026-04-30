from flask import Blueprint, jsonify, request
from .. import db
from ..models import WorldEntity, World, ImageGenerationLog
from ..image_service import generate_image, edit_image, save_uploaded_file

entities_bp = Blueprint("entities", __name__, url_prefix="/api")


@entities_bp.route("/worlds/<world_id>/entities", methods=["GET"])
def list_entities(world_id):
    db.get_or_404(World, world_id)
    entities = (WorldEntity.query
        .filter_by(world_id=world_id)
        .order_by(WorldEntity.entity_type, WorldEntity.created_at)
        .all())
    return jsonify([e.to_dict() for e in entities])


@entities_bp.route("/worlds/<world_id>/entities", methods=["POST"])
def create_entity(world_id):
    db.get_or_404(World, world_id)
    data = request.get_json()
    if not data or not data.get("name"):
        return jsonify({"error": "name is required"}), 400
    entity_type = data.get("entity_type", "other")
    if entity_type not in WorldEntity.VALID_TYPES:
        return jsonify({"error": f"entity_type must be one of {WorldEntity.VALID_TYPES}"}), 400
    entity = WorldEntity(
        world_id=world_id,
        name=data["name"],
        description=data.get("description"),
        entity_type=entity_type,
    )
    db.session.add(entity)
    db.session.commit()
    return jsonify(entity.to_dict()), 201


@entities_bp.route("/entities/<entity_id>", methods=["GET"])
def get_entity(entity_id):
    entity = db.get_or_404(WorldEntity, entity_id)
    return jsonify(entity.to_dict())


@entities_bp.route("/entities/<entity_id>", methods=["PUT"])
def update_entity(entity_id):
    entity = db.get_or_404(WorldEntity, entity_id)
    data = request.get_json()
    if "entity_type" in data and data["entity_type"] not in WorldEntity.VALID_TYPES:
        return jsonify({"error": f"entity_type must be one of {WorldEntity.VALID_TYPES}"}), 400
    for field in ("name", "description", "entity_type"):
        if field in data:
            setattr(entity, field, data[field])
    db.session.commit()
    return jsonify(entity.to_dict())


@entities_bp.route("/entities/<entity_id>", methods=["DELETE"])
def delete_entity(entity_id):
    entity = db.get_or_404(WorldEntity, entity_id)
    db.session.delete(entity)
    db.session.commit()
    return jsonify({"message": "deleted"}), 200


@entities_bp.route("/entities/<entity_id>/generate-image", methods=["POST"])
def generate_entity_image(entity_id):
    entity = db.get_or_404(WorldEntity, entity_id)
    world = db.session.get(World, entity.world_id)
    data = request.get_json(silent=True) or {}
    desc = data.get("description") or entity.description or entity.name
    prompt = (
        f"Context: [World: {world.title} — {world.description}] "
        f"Draw {entity.entity_type}: {entity.name} — {desc}"
    )
    try:
        image_url = generate_image(prompt)
        entity.image_path = image_url
        entity.gemini_file_name = None
        entity.gemini_file_uploaded_at = None
        log = ImageGenerationLog(
            entity_type="world_entity", entity_id=entity_id,
            action="generate", prompt=prompt, result_image_path=image_url, success=True,
        )
        db.session.add(log)
        db.session.commit()
        return jsonify({"image_path": image_url})
    except Exception as e:
        log = ImageGenerationLog(
            entity_type="world_entity", entity_id=entity_id,
            action="generate", prompt=prompt, success=False,
            reason_code="gemini_error", error_message=str(e),
        )
        db.session.add(log)
        db.session.commit()
        return jsonify({"error": str(e)}), 500


@entities_bp.route("/entities/<entity_id>/edit-image", methods=["POST"])
def edit_entity_image(entity_id):
    entity = db.get_or_404(WorldEntity, entity_id)
    if not entity.image_path:
        return jsonify({"error": "Entity has no image to edit"}), 400
    data = request.get_json(silent=True) or {}
    modification_text = (data.get("modification_text") or "").strip()
    if not modification_text:
        return jsonify({"error": "modification_text is required"}), 400
    try:
        image_url = edit_image(entity.image_path, modification_text)
        entity.image_path = image_url
        entity.gemini_file_name = None
        entity.gemini_file_uploaded_at = None
        log = ImageGenerationLog(
            entity_type="world_entity", entity_id=entity_id,
            action="edit", prompt=modification_text, result_image_path=image_url, success=True,
        )
        db.session.add(log)
        db.session.commit()
        return jsonify({"image_path": image_url})
    except Exception as e:
        log = ImageGenerationLog(
            entity_type="world_entity", entity_id=entity_id,
            action="edit", prompt=modification_text, success=False,
            reason_code="gemini_error", error_message=str(e),
        )
        db.session.add(log)
        db.session.commit()
        return jsonify({"error": str(e)}), 500


@entities_bp.route("/entities/<entity_id>/upload-image", methods=["POST"])
def upload_entity_image(entity_id):
    entity = db.get_or_404(WorldEntity, entity_id)
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    try:
        image_url = save_uploaded_file(file)
        entity.image_path = image_url
        entity.gemini_file_name = None
        entity.gemini_file_uploaded_at = None
        log = ImageGenerationLog(
            entity_type="world_entity", entity_id=entity_id,
            action="upload", result_image_path=image_url, success=True,
        )
        db.session.add(log)
        db.session.commit()
        return jsonify({"image_path": image_url})
    except Exception as e:
        log = ImageGenerationLog(
            entity_type="world_entity", entity_id=entity_id,
            action="upload", success=False,
            reason_code="upload_error", error_message=str(e),
        )
        db.session.add(log)
        db.session.commit()
        return jsonify({"error": str(e)}), 500
