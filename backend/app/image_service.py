import os
import uuid
import base64
from flask import current_app


def _get_storage_path():
    return current_app.config["IMAGE_STORAGE_PATH"]


def save_image_bytes(image_bytes: bytes, extension: str = "png") -> str:
    """Save raw bytes to the image storage directory. Returns server-relative URL."""
    filename = f"{uuid.uuid4()}.{extension}"
    storage_path = _get_storage_path()
    os.makedirs(storage_path, exist_ok=True)
    filepath = os.path.join(storage_path, filename)
    with open(filepath, "wb") as f:
        f.write(image_bytes)
    return f"/static/images/{filename}"


def _sanitize_prompt(prompt: str) -> str:
    import re
    return re.sub(r'\bbackground\b', 'setting', prompt, flags=re.IGNORECASE)


def generate_image(prompt: str) -> str:
    """Generate an image via Gemini and return the server-relative URL."""
    import google.generativeai as genai
    prompt = _sanitize_prompt(prompt)

    api_key = current_app.config.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set")

    genai.configure(api_key=api_key)

    model = genai.GenerativeModel("gemini-3.1-flash-image-preview")

    response = model.generate_content(prompt)

    for part in response.candidates[0].content.parts:
        if part.inline_data is not None and part.inline_data.data:
            image_bytes = part.inline_data.data
            if isinstance(image_bytes, str):
                image_bytes = base64.b64decode(image_bytes)
            mime_type = part.inline_data.mime_type
            ext = mime_type.split("/")[-1] if "/" in mime_type else "png"
            if ext == "jpeg":
                ext = "jpg"
            return save_image_bytes(image_bytes, ext)

    finish_reason = getattr(response.candidates[0], "finish_reason", None) if response.candidates else None
    raise RuntimeError(f"No image returned (finish_reason: {finish_reason})")


def edit_image(image_url: str, modification_text: str) -> str:
    """Edit an existing image via Gemini nano-banana-2 and return the server-relative URL."""
    import google.generativeai as genai

    api_key = current_app.config.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set")

    genai.configure(api_key=api_key)

    storage_path = _get_storage_path()
    filename = os.path.basename(image_url)
    image_path = os.path.join(storage_path, filename)

    with open(image_path, "rb") as f:
        image_bytes = f.read()

    ext = os.path.splitext(filename)[1].lstrip(".").lower()
    mime_type = f"image/{'jpeg' if ext == 'jpg' else ext}"

    model = genai.GenerativeModel("gemini-3.1-flash-image-preview")

    image_part = genai.protos.Part(
        inline_data=genai.protos.Blob(mime_type=mime_type, data=image_bytes)
    )
    response = model.generate_content([image_part, modification_text])

    for part in response.candidates[0].content.parts:
        if part.inline_data is not None and part.inline_data.data:
            raw = part.inline_data.data
            out_mime = part.inline_data.mime_type
            out_ext = out_mime.split("/")[-1] if "/" in out_mime else "png"
            if out_ext == "jpeg":
                out_ext = "jpg"
            if isinstance(raw, str):
                raw = base64.b64decode(raw)
            return save_image_bytes(raw, out_ext)

    finish_reason = getattr(response.candidates[0], "finish_reason", None) if response.candidates else None
    raise RuntimeError(f"No image returned (finish_reason: {finish_reason})")


def save_uploaded_file(file_storage) -> str:
    """Save a werkzeug FileStorage object and return the server-relative URL."""
    original_ext = os.path.splitext(file_storage.filename)[1].lstrip(".") or "png"
    filename = f"{uuid.uuid4()}.{original_ext}"
    storage_path = _get_storage_path()
    os.makedirs(storage_path, exist_ok=True)
    filepath = os.path.join(storage_path, filename)
    file_storage.save(filepath)
    return f"/static/images/{filename}"
