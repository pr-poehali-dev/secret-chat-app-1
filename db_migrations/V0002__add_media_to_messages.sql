ALTER TABLE t_p18070069_secret_chat_app_1.messages
  ADD COLUMN IF NOT EXISTS media_url  TEXT,
  ADD COLUMN IF NOT EXISTS media_type VARCHAR(10);
