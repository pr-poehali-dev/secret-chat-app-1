"""
Чат API: отправка, получение, редактирование и скрытие сообщений.
POST   /           — отправить сообщение
GET    /?from_id=&to_id=&since= — получить сообщения
PATCH  /           — { action: "edit"|"hide", msg_id, from_id, text? }
"""

import json
import os
import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p18070069_secret_chat_app_1")

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")

    if method == "POST":
        try:
            body_peek = json.loads(event.get("body") or "{}")
        except Exception:
            body_peek = {}
        if body_peek.get("_method") == "patch":
            return patch_message(event)
        return send_message(event)
    elif method == "GET":
        return get_messages(event)
    elif method == "PATCH":
        return patch_message(event)

    return {"statusCode": 405, "headers": CORS, "body": json.dumps({"error": "Method not allowed"})}


def send_message(event: dict) -> dict:
    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Invalid JSON"})}

    from_id    = (body.get("from_id") or "").strip()
    to_id      = (body.get("to_id") or "").strip()
    text       = (body.get("text") or "").strip()
    media_url  = (body.get("media_url") or "").strip() or None
    media_type = (body.get("media_type") or "").strip() or None

    if not from_id or not to_id:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "from_id and to_id required"})}
    if not text and not media_url:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "text or media_url required"})}
    if len(text) > 4000:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Message too long"})}

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            f"""INSERT INTO {SCHEMA}.messages (from_id, to_id, text, media_url, media_type)
                VALUES (%s, %s, %s, %s, %s) RETURNING id, created_at""",
            (from_id, to_id, text or None, media_url, media_type)
        )
        row = cur.fetchone()
        conn.commit()
        return {
            "statusCode": 200,
            "headers": CORS,
            "body": json.dumps({"id": row[0], "created_at_ms": int(row[1].timestamp() * 1000)})
        }
    finally:
        conn.close()


def get_messages(event: dict) -> dict:
    params   = event.get("queryStringParameters") or {}
    from_id  = (params.get("from_id") or "").strip()
    to_id    = (params.get("to_id") or "").strip()
    since_ms = int(params.get("since") or "0")

    if not from_id or not to_id:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "from_id and to_id required"})}

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT id, from_id, to_id, text,
                   EXTRACT(EPOCH FROM created_at)::BIGINT * 1000 AS ts_ms,
                   media_url, media_type, hidden,
                   CASE WHEN edited_at IS NOT NULL
                        THEN EXTRACT(EPOCH FROM edited_at)::BIGINT * 1000
                        ELSE NULL END AS edited_ms
            FROM {SCHEMA}.messages
            WHERE LEAST(from_id, to_id) = LEAST(%s, %s)
              AND GREATEST(from_id, to_id) = GREATEST(%s, %s)
              AND created_at > TO_TIMESTAMP(%s / 1000.0)
            ORDER BY created_at ASC
            LIMIT 200
            """,
            (from_id, to_id, from_id, to_id, since_ms)
        )
        rows = cur.fetchall()
        messages = [
            {
                "id": r[0], "from_id": r[1], "to_id": r[2],
                "text": r[3], "ts": r[4],
                "media_url": r[5], "media_type": r[6],
                "hidden": r[7], "edited_ms": r[8]
            }
            for r in rows
        ]
        return {"statusCode": 200, "headers": CORS, "body": json.dumps({"messages": messages})}
    finally:
        conn.close()


def patch_message(event: dict) -> dict:
    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Invalid JSON"})}

    action  = (body.get("action") or "").strip()
    msg_id  = body.get("msg_id")
    from_id = (body.get("from_id") or "").strip()

    if not action or not msg_id or not from_id:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "action, msg_id, from_id required"})}

    conn = get_conn()
    try:
        cur = conn.cursor()

        if action == "hide":
            cur.execute(
                f"UPDATE {SCHEMA}.messages SET hidden = TRUE WHERE id = %s AND from_id = %s",
                (msg_id, from_id)
            )
            conn.commit()
            if cur.rowcount == 0:
                return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "Not found or not your message"})}
            return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True})}

        elif action == "edit":
            new_text = (body.get("text") or "").strip()
            if not new_text:
                return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "text required for edit"})}
            if len(new_text) > 4000:
                return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Message too long"})}
            cur.execute(
                f"UPDATE {SCHEMA}.messages SET text = %s, edited_at = NOW() WHERE id = %s AND from_id = %s",
                (new_text, msg_id, from_id)
            )
            conn.commit()
            if cur.rowcount == 0:
                return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "Not found or not your message"})}
            return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True})}

        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Unknown action"})}
    finally:
        conn.close()