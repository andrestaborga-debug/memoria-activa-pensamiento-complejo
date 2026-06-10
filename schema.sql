-- D1 schema for the encrypted vault sync backend.
-- The `blob` column holds ONLY AES-GCM ciphertext (as JSON: {salt, iv, data}).
-- The server never stores or sees plaintext passwords or the master key.

CREATE TABLE IF NOT EXISTS vaults (
  user_id    TEXT PRIMARY KEY,   -- Cloudflare Access identity (email or sub)
  blob       TEXT NOT NULL,      -- encrypted vault blob, JSON-encoded ciphertext
  version    INTEGER NOT NULL DEFAULT 1,  -- optimistic-concurrency counter
  updated_at INTEGER NOT NULL    -- last write, epoch ms
);
