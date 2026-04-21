from flask import Blueprint, jsonify, request
from .. import db
from ..models import World, Story, ImageGenerationLog
from ..image_service import generate_image, edit_image, save_uploaded_file

stories_bp = Blueprint("stories", __name__, url_prefix="/api")


@stories_bp.route("/worlds/<world_id>/stories", methods=["GET"])
def list_stories(world_id):
    db.get_or_404(World, world_id)
    stories = Story.query.filter_by(world_id=world_id).order_by(Story.order_index).all()
    return jsonify([s.to_dict() for s in stories])


@stories_bp.route("/worlds/<world_id>/stories", methods=["POST"])
def create_story(world_id):
    db.get_or_404(World, world_id)
    data = request.get_json()
    if not data or not data.get("title") or not data.get("description"):
        return jsonify({"error": "title and description are required"}), 400
    max_order = db.session.query(db.func.max(Story.order_index)).filter_by(world_id=world_id).scalar() or 0
    story = Story(
        world_id=world_id,
        title=data["title"],
        description=data["description"],
        order_index=max_order + 1,
    )
    db.session.add(story)
    db.session.commit()
    return jsonify(story.to_dict()), 201


@stories_bp.route("/stories/<story_id>", methods=["GET"])
def get_story(story_id):
    story = db.get_or_404(Story, story_id)
    return jsonify(story.to_dict(include_items=True))


@stories_bp.route("/stories/<story_id>", methods=["PUT"])
def update_story(story_id):
    story = db.get_or_404(Story, story_id)
    data = request.get_json()
    if "title" in data:
        story.title = data["title"]
    if "description" in data:
        story.description = data["description"]
    if "order_index" in data:
        story.order_index = data["order_index"]
    if "voice" in data:
        story.voice = data["voice"]
    db.session.commit()
    return jsonify(story.to_dict())


@stories_bp.route("/stories/<story_id>", methods=["DELETE"])
def delete_story(story_id):
    story = db.get_or_404(Story, story_id)
    db.session.delete(story)
    db.session.commit()
    return jsonify({"message": "deleted"}), 200


@stories_bp.route("/stories/<story_id>/generate-image", methods=["POST"])
def generate_story_image(story_id):
    story = db.get_or_404(Story, story_id)
    try:
        image_url = generate_image(story.description)
        story.image_path = image_url
        log = ImageGenerationLog(entity_type="story", entity_id=story_id, action="generate",
                                 prompt=story.description, result_image_path=image_url, success=True)
        db.session.add(log)
        db.session.commit()
        return jsonify({"image_path": image_url})
    except Exception as e:
        log = ImageGenerationLog(entity_type="story", entity_id=story_id, action="generate",
                                 prompt=story.description, success=False,
                                 reason_code="gemini_error", error_message=str(e))
        db.session.add(log)
        db.session.commit()
        return jsonify({"error": str(e)}), 500


@stories_bp.route("/stories/<story_id>/edit-image", methods=["POST"])
def edit_story_image(story_id):
    story = db.get_or_404(Story, story_id)
    if not story.image_path:
        log = ImageGenerationLog(entity_type="story", entity_id=story_id, action="edit",
                                 prompt=None, success=False, reason_code="no_image",
                                 error_message="Story has no image to edit")
        db.session.add(log)
        db.session.commit()
        return jsonify({"error": "Story has no image to edit"}), 400
    data = request.get_json()
    modification_text = (data.get("modification_text") or "").strip()
    if not modification_text:
        return jsonify({"error": "modification_text is required"}), 400
    try:
        image_url = edit_image(story.image_path, modification_text)
        story.image_path = image_url
        story.description = f"{story.description or ''} ({modification_text})"
        log = ImageGenerationLog(entity_type="story", entity_id=story_id, action="edit",
                                 prompt=modification_text, result_image_path=image_url, success=True)
        db.session.add(log)
        db.session.commit()
        return jsonify({"image_path": image_url, "description": story.description})
    except Exception as e:
        log = ImageGenerationLog(entity_type="story", entity_id=story_id, action="edit",
                                 prompt=modification_text, success=False,
                                 reason_code="gemini_error", error_message=str(e))
        db.session.add(log)
        db.session.commit()
        return jsonify({"error": str(e)}), 500


@stories_bp.route("/stories/<story_id>/upload-image", methods=["POST"])
def upload_story_image(story_id):
    story = db.get_or_404(Story, story_id)
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    try:
        image_url = save_uploaded_file(file)
        story.image_path = image_url
        log = ImageGenerationLog(entity_type="story", entity_id=story_id, action="upload",
                                 prompt=None, result_image_path=image_url, success=True)
        db.session.add(log)
        db.session.commit()
        return jsonify({"image_path": image_url})
    except Exception as e:
        log = ImageGenerationLog(entity_type="story", entity_id=story_id, action="upload",
                                 prompt=None, success=False,
                                 reason_code="upload_error", error_message=str(e))
        db.session.add(log)
        db.session.commit()
        return jsonify({"error": str(e)}), 500
