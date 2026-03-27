from flask import Blueprint, jsonify, request
from .. import db
from ..models import Story, StoryItem
from ..image_service import generate_image, edit_image, save_uploaded_file

items_bp = Blueprint("items", __name__, url_prefix="/api")


@items_bp.route("/stories/<story_id>/items", methods=["GET"])
def list_items(story_id):
    db.get_or_404(Story, story_id)
    items = StoryItem.query.filter_by(story_id=story_id).order_by(StoryItem.order_index).all()
    return jsonify([i.to_dict() for i in items])


@items_bp.route("/stories/<story_id>/items", methods=["POST"])
def create_item(story_id):
    db.get_or_404(Story, story_id)
    data = request.get_json()
    if not data or data.get("type") not in StoryItem.VALID_TYPES:
        return jsonify({"error": f"type must be one of {StoryItem.VALID_TYPES}"}), 400

    if "order_index" in data:
        order_index = data["order_index"]
        StoryItem.query.filter(
            StoryItem.story_id == story_id,
            StoryItem.order_index >= order_index,
        ).update({"order_index": StoryItem.order_index + 1})
    else:
        order_index = (
            db.session.query(db.func.max(StoryItem.order_index)).filter_by(story_id=story_id).scalar() or 0
        ) + 1

    item = StoryItem(
        story_id=story_id,
        type=data["type"],
        order_index=order_index,
        description=data.get("description"),
        narrative_text=data.get("narrative_text"),
    )
    db.session.add(item)
    db.session.commit()
    return jsonify(item.to_dict()), 201


@items_bp.route("/items/<item_id>", methods=["PUT"])
def update_item(item_id):
    item = db.get_or_404(StoryItem, item_id)
    data = request.get_json()
    if "description" in data:
        item.description = data["description"]
    if "narrative_text" in data:
        item.narrative_text = data["narrative_text"]
    if "order_index" in data:
        item.order_index = data["order_index"]
    db.session.commit()
    return jsonify(item.to_dict())


@items_bp.route("/items/<item_id>", methods=["DELETE"])
def delete_item(item_id):
    item = db.get_or_404(StoryItem, item_id)
    db.session.delete(item)
    db.session.commit()
    return jsonify({"message": "deleted"}), 200


@items_bp.route("/items/<item_id>/generate-image", methods=["POST"])
def generate_item_image(item_id):
    item = db.get_or_404(StoryItem, item_id)
    if item.type != "image_scene":
        return jsonify({"error": "Only image_scene items support image generation"}), 400
    if not item.description:
        return jsonify({"error": "Item has no description to use as prompt"}), 400
    try:
        image_url = generate_image(item.description)
        item.image_path = image_url
        db.session.commit()
        return jsonify({"image_path": image_url})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@items_bp.route("/items/<item_id>/edit-image", methods=["POST"])
def edit_item_image(item_id):
    item = db.get_or_404(StoryItem, item_id)
    if item.type != "image_scene":
        return jsonify({"error": "Only image_scene items support image editing"}), 400
    if not item.image_path:
        return jsonify({"error": "Item has no image to edit"}), 400
    data = request.get_json()
    modification_text = (data.get("modification_text") or "").strip()
    if not modification_text:
        return jsonify({"error": "modification_text is required"}), 400
    try:
        image_url = edit_image(item.image_path, modification_text)
        item.image_path = image_url
        current_desc = item.description or ""
        item.description = f"{current_desc} ({modification_text})"
        db.session.commit()
        return jsonify({"image_path": image_url, "description": item.description})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@items_bp.route("/items/<item_id>/upload-image", methods=["POST"])
def upload_item_image(item_id):
    item = db.get_or_404(StoryItem, item_id)
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    try:
        image_url = save_uploaded_file(file)
        item.image_path = image_url
        db.session.commit()
        return jsonify({"image_path": image_url})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@items_bp.route("/stories/<story_id>/items/reorder", methods=["PATCH"])
def reorder_items(story_id):
    db.get_or_404(Story, story_id)
    data = request.get_json()
    item_ids = data.get("item_ids")
    if not item_ids or not isinstance(item_ids, list):
        return jsonify({"error": "item_ids must be a list"}), 400

    items = StoryItem.query.filter(
        StoryItem.id.in_(item_ids),
        StoryItem.story_id == story_id,
    ).all()

    item_map = {item.id: item for item in items}
    for index, item_id in enumerate(item_ids):
        if item_id in item_map:
            item_map[item_id].order_index = index

    db.session.commit()
    updated = StoryItem.query.filter_by(story_id=story_id).order_by(StoryItem.order_index).all()
    return jsonify([i.to_dict() for i in updated])
