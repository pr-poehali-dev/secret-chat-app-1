"""
Загрузка медиафайлов (фото/видео) в S3.
POST / — тело: { "filename": "photo.jpg", "content_type": "image/jpeg", "data": "<base64>" }
Возвращает: { "url": "https://cdn.poehali.dev/..." }
"""

import base64
import json
import os
import uuid

import boto3
import psycopg2  # noqa: F401 — ensure psycopg2 is available in layer

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p18070069_secret_chat_app_1")

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}

ALLOWED_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
}

MAX_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    if event.get("httpMethod") != "POST":
        return {"statusCode": 405, "headers": CORS, "body": json.dumps({"error": "Method not allowed"})}

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Invalid JSON"})}

    filename = (body.get("filename") or "file").strip()
    content_type = (body.get("content_type") or "").strip()
    data_b64 = body.get("data") or ""

    if content_type not in ALLOWED_TYPES:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Unsupported file type"})}

    try:
        file_bytes = base64.b64decode(data_b64)
    except Exception:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Invalid base64 data"})}

    if len(file_bytes) > MAX_SIZE_BYTES:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "File too large (max 20MB)"})}

    ext = ALLOWED_TYPES[content_type]
    key = f"chat-media/{uuid.uuid4().hex}.{ext}"

    s3 = boto3.client(
        "s3",
        endpoint_url="https://bucket.poehali.dev",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )
    s3.put_object(Bucket="files", Key=key, Body=file_bytes, ContentType=content_type)

    cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"

    media_type = "video" if content_type.startswith("video/") else "image"

    return {
        "statusCode": 200,
        "headers": CORS,
        "body": json.dumps({"url": cdn_url, "media_type": media_type}),
    }
