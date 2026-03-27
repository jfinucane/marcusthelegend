from flask import Blueprint, request, jsonify
from ..models import User

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    password = data.get("password", "")

    if not password:
        return jsonify({"error": "Password required"}), 400

    users = User.query.all()
    for user in users:
        if user.check_password(password):
            return jsonify({"authenticated": True})

    return jsonify({"error": "Incorrect password"}), 401
