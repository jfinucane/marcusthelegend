import io
import os
import base64
import shutil
import time
from pathlib import Path
import anthropic
from PIL import Image

IMAGES_DIR = Path(__file__).parent / "static" / "images"
BUCKETS_DIR = Path(__file__).parent / "static" / "image-buckets"
BUCKETS = ["war", "baseball", "hiking", "silkpunk", "other"]
BATCH_SIZE = 10
MAX_BYTES = 5 * 1024 * 1024 * 3 // 4  # API limit is on base64 payload (~4/3 of raw)

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


def load_image_bytes(image_path: Path) -> tuple[bytes, str]:
    suffix = image_path.suffix.lower()
    media_type = "image/jpeg" if suffix in (".jpg", ".jpeg") else "image/png"
    raw = image_path.read_bytes()
    if not raw:
        return None, media_type
    if len(raw) <= MAX_BYTES:
        return raw, media_type
    img = Image.open(image_path).convert("RGB")
    buf = io.BytesIO()
    scale = 0.9
    while True:
        buf.seek(0)
        buf.truncate()
        new_size = (int(img.width * scale), int(img.height * scale))
        img.resize(new_size, Image.LANCZOS).save(buf, format="JPEG", quality=85)
        if buf.tell() <= MAX_BYTES:
            break
        scale *= 0.85
    return buf.getvalue(), "image/jpeg"


def classify_image(image_path: Path) -> str:
    raw, media_type = load_image_bytes(image_path)
    if not raw:
        return "other"
    image_data = base64.standard_b64encode(raw).decode("utf-8")

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=10,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            "Classify this image into exactly one of these categories: "
                            "war, baseball, hiking, silkpunk, other. "
                            "'silkpunk' means an aesthetic blending East Asian art with steampunk/biopunk technology. "
                            "Reply with only the single category word, nothing else."
                        ),
                    },
                ],
            }
        ],
    )

    label = response.content[0].text.strip().lower()
    return label if label in BUCKETS else "other"


def main():
    images = [
        p for p in IMAGES_DIR.iterdir()
        if p.suffix.lower() in (".jpg", ".jpeg", ".png") and p.is_file()
    ]

    print(f"Found {len(images)} images to classify.")
    counts = {b: 0 for b in BUCKETS}
    errors = 0

    for i, image_path in enumerate(images, 1):
        try:
            bucket = classify_image(image_path)
            dest = BUCKETS_DIR / bucket / image_path.name
            shutil.copy2(image_path, dest)
            counts[bucket] += 1
            print(f"[{i}/{len(images)}] {image_path.name} → {bucket}")
        except Exception as e:
            print(f"[{i}/{len(images)}] ERROR {image_path.name}: {e}")
            errors += 1

        if i % BATCH_SIZE == 0:
            time.sleep(1)

    print("\n=== Results ===")
    for bucket, count in counts.items():
        print(f"  {bucket:12s}: {count}")
    print(f"  errors      : {errors}")


if __name__ == "__main__":
    main()
