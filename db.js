const { Pool } = require('pg');

let pool;

function initDB() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pulse',
  });

  pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nickname TEXT NOT NULL,
      avatar_color TEXT NOT NULL DEFAULT '#6366f1',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL REFERENCES users(id),
      receiver_id INTEGER,
      chat_id INTEGER,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  pool.query(`
    CREATE TABLE IF NOT EXISTS chats (
      id SERIAL PRIMARY KEY,
      name TEXT,
      type TEXT DEFAULT 'private',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  pool.query(`
    CREATE TABLE IF NOT EXISTS chat_members (
      chat_id INTEGER NOT NULL REFERENCES chats(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      PRIMARY KEY (chat_id, user_id)
    );
  `);

  return pool;
}

function getDB() {
  if (!pool) initDB();
  return pool;
}

module.exports = { initDB, getDB };
