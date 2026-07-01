CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  code TEXT PRIMARY KEY,
  player1_id TEXT NOT NULL REFERENCES users(id),
  player2_id TEXT REFERENCES users(id),
  winner_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
