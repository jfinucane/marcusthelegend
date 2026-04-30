import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
from dotenv import load_dotenv

# Load .env from backend/ directory
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

db = SQLAlchemy()
migrate = Migrate()


def _make_sqlalchemy_uri(database_url: str) -> str:
    """Convert postgresql:// URL to psycopg v3 dialect."""
    if database_url.startswith("postgresql://") or database_url.startswith("postgres://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1).replace(
            "postgres://", "postgresql+psycopg://", 1
        )
    return database_url


def create_app():
    app = Flask(
        __name__,
        static_folder=os.path.join(os.path.dirname(os.path.dirname(__file__)), "static"),
        static_url_path="/static",
    )

    from config import Config
    app.config.from_object(Config)
    app.config["SQLALCHEMY_DATABASE_URI"] = _make_sqlalchemy_uri(app.config["DATABASE_URL"] or "")
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    os.makedirs(app.config["IMAGE_STORAGE_PATH"], exist_ok=True)

    db.init_app(app)
    migrate.init_app(app, db)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    @app.after_request
    def add_private_network_header(response):
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response

    from .routes.worlds import worlds_bp
    from .routes.stories import stories_bp
    from .routes.items import items_bp
    from .routes.auth import auth_bp
    from .routes.tts import tts_bp
    from .routes.entities import entities_bp

    app.register_blueprint(worlds_bp)
    app.register_blueprint(stories_bp)
    app.register_blueprint(items_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(tts_bp)
    app.register_blueprint(entities_bp)

    return app
