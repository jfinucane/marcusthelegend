import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


class Config:
    DATABASE_URL = os.getenv("DATABASE_URL")
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    IMAGE_STORAGE_PATH = os.path.join(BASE_DIR, "static", "images")
    DEBUG = os.getenv("FLASK_ENV") == "development"
