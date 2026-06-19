const { Pool } = require('pg');

let pool;

async function initDB() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pulse',
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT,
      nickname TEXT NOT NULL,
      avatar_color TEXT NOT NULL DEFAULT '#6366f1',
      firebase_uid TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE');
  await pool.query('ALTER TABLE users ALTER COLUMN password DROP NOT NULL');
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT ''");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_version INTEGER DEFAULT 0");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS label TEXT DEFAULT ''");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chats (
      id SERIAL PRIMARY KEY,
      name TEXT,
      type TEXT DEFAULT 'private',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      username TEXT UNIQUE,
      owner_id INTEGER REFERENCES users(id),
      description TEXT DEFAULT ''
    )
  `);
  await pool.query("ALTER TABLE chats ADD COLUMN IF NOT EXISTS username TEXT UNIQUE");
  await pool.query("ALTER TABLE chats ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)");
  await pool.query("ALTER TABLE chats ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''");
  await pool.query("ALTER TABLE chats ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT ''");
  await pool.query("ALTER TABLE chats ADD COLUMN IF NOT EXISTS avatar_version INTEGER DEFAULT 0");
  await pool.query("ALTER TABLE chats ADD COLUMN IF NOT EXISTS label TEXT DEFAULT ''");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_members (
      chat_id INTEGER NOT NULL REFERENCES chats(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      role TEXT DEFAULT 'member',
      PRIMARY KEY (chat_id, user_id)
    )
  `);
  await pool.query("ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member'");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_bans (
      chat_id INTEGER NOT NULL REFERENCES chats(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      PRIMARY KEY (chat_id, user_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS photo_messages (
      id SERIAL PRIMARY KEY,
      chat_id INTEGER NOT NULL REFERENCES chats(id),
      sender_id INTEGER NOT NULL REFERENCES users(id),
      photo_url TEXT NOT NULL,
      caption TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);


  return pool;
}

function getDB() {
  return pool;
}

module.exports = { initDB, getDB };
