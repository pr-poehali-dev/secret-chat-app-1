CREATE TABLE IF NOT EXISTS t_p18070069_secret_chat_app_1.messages (
  id          BIGSERIAL PRIMARY KEY,
  from_id     VARCHAR(11) NOT NULL,
  to_id       VARCHAR(11) NOT NULL,
  text        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_pair ON t_p18070069_secret_chat_app_1.messages (
  LEAST(from_id, to_id),
  GREATEST(from_id, to_id),
  created_at
);

CREATE INDEX IF NOT EXISTS idx_messages_to_id ON t_p18070069_secret_chat_app_1.messages (to_id, created_at);
