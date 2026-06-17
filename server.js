const express = require('express');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const { initDB } = require('./db');

const BOT_USERNAME = 'pulsechatbot';
const BOT_NICKNAME = 'Pulse Chat Bot';
const BOT_UID = 'bot_pulsechatbot';
const BOT_COLOR = '#6366f1';

const GIGACHAT_AUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const GIGACHAT_API_URL = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';
const GIGACHAT_AUTH_KEY = 'MDE5ZTc4MDMtYWRlZi03YTc1LTg0NDgtOTMyYzcxODFmNjJiOjMzMmFmMWNjLWZiZjctNGNlMi1iMjQ1LTJiZWUwZDYyYTI0Mg==';
const GIGACHAT_SCOPE = 'GIGACHAT_API_PERS';

let gigaChatToken = null;
let gigaChatTokenExpires = 0;
let botUser = null;



async function ensureBotUser(db) {
  const { rows: existing } = await db.query('SELECT id, username, nickname, avatar_color FROM users WHERE firebase_uid = $1', [BOT_UID]);
  if (existing.length) { botUser = existing[0]; return; }
  const { rows } = await db.query(
    'INSERT INTO users (username, nickname, avatar_color, firebase_uid) VALUES ($1, $2, $3, $4) RETURNING id, username, nickname, avatar_color',
    [BOT_USERNAME, BOT_NICKNAME, BOT_COLOR, BOT_UID]
  );
  botUser = rows[0];
}

function httpsPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, port: u.port || 443,
      path: u.pathname + u.search, method: 'POST',
      headers, rejectUnauthorized: false,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getGigaChatToken() {
  if (gigaChatToken && Date.now() < gigaChatTokenExpires) return gigaChatToken;
  const body = 'scope=' + encodeURIComponent(GIGACHAT_SCOPE);
  const { status, data } = await httpsPost(GIGACHAT_AUTH_URL, body, {
    'Authorization': 'Basic ' + GIGACHAT_AUTH_KEY,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
    'RqUID': crypto.randomUUID(),
  });
  if (status !== 200) throw new Error('GigaChat auth failed: ' + JSON.stringify(data));
  gigaChatToken = data.access_token;
  gigaChatTokenExpires = Date.now() + (data.expires_at ? (new Date(data.expires_at).getTime() - Date.now()) : 1500000);
  return gigaChatToken;
}

async function callGigaChat(userMessage) {
  const token = await getGigaChatToken();
  const body = JSON.stringify({
    model: 'GigaChat',
    messages: [
      { role: 'system', content: 'Ты — Pulse Chat Bot, дружелюбный помощник в мессенджере Pulse. Отвечай кратко и полезно. Никогда не упоминай, что ты создан какой-либо компанией, и не говори о своей модели. Просто помогай пользователям.' },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.7,
    max_tokens: 1000,
  });
  const { status, data } = await httpsPost(GIGACHAT_API_URL, body, {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  });
  if (status !== 200) throw new Error('GigaChat API error: ' + JSON.stringify(data));
  return data.choices[0].message.content;
}

async function handleBotResponse(chatId, userMessage, sender, db, io) {
  try {
    const reply = await callGigaChat(userMessage);
    const { rows } = await db.query(
      'INSERT INTO messages (sender_id, receiver_id, chat_id, content) VALUES ($1, $2, $3, $4) RETURNING id',
      [botUser.id, sender.id, chatId, encryptText(reply)]
    );
    const { rows: msg } = await db.query(`
      SELECT m.*, u.nickname as sender_name, u.avatar_color as sender_color
      FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = $1
    `, [rows[0].id]);
    msg[0].content = decryptText(msg[0].content);
    io.emit('message:new', msg[0]);
  } catch (err) {
    console.error('Bot response error:', err);
  }
}

function getEncryptionKey() {
  return crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || 'pulse-default-key!change-me').digest();
}

function encryptText(text) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let enc = cipher.update(text, 'utf8', 'hex');
  enc += cipher.final('hex');
  return iv.toString('hex') + ':' + enc;
}

function decryptText(data) {
  if (!data || !data.includes(':')) return data;
  try {
    const key = getEncryptionKey();
    const parts = data.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let dec = decipher.update(parts[1], 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch { return data; }
}

async function main() {
  const db = await initDB();
  await ensureBotUser(db);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ['http://pulse.xo.je', 'https://pulse.xo.je', 'http://localhost:3000', 'http://localhost:5500'], methods: ['GET', 'POST'] }
});

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });
  app.use(express.json());

  const onlineUsers = new Map();

  function getOnlineUsersList() {
    const list = Array.from(onlineUsers.values()).map(u => ({
      id: u.id, username: u.username, nickname: u.nickname, avatar_color: u.avatar_color
    }));
    if (botUser) list.unshift(botUser);
    return list;
  }

  app.post('/api/register', async (req, res) => {
    const { username, password, nickname } = req.body;
    if (!username || !password || !nickname) {
      return res.status(400).json({ error: 'All fields required' });
    }
    try {
      const { rows: existing } = await db.query('SELECT id FROM users WHERE username = $1', [username]);
      if (existing.length) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      const hashed = bcrypt.hashSync(password, 10);
      const colors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      const { rows } = await db.query(
        'INSERT INTO users (username, password, nickname, avatar_color) VALUES ($1, $2, $3, $4) RETURNING id, username, nickname, avatar_color',
        [username, hashed, nickname, color]
      );
      res.json({ user: rows[0] });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    try {
      const { rows } = await db.query('SELECT * FROM users WHERE username = $1', [username]);
      if (!rows.length || !bcrypt.compareSync(password, rows[0].password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const u = rows[0];
      res.json({ user: { id: u.id, username: u.username, nickname: u.nickname, avatar_color: u.avatar_color } });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/auth/google', async (req, res) => {
    const { uid, displayName, email } = req.body;
    if (!uid) return res.status(400).json({ error: 'No uid' });
    try {
      const nickname = displayName || email || uid.slice(0, 8);
      const { rows: existing } = await db.query('SELECT id, username, nickname, avatar_color FROM users WHERE firebase_uid = $1', [uid]);
      if (existing.length) return res.json({ user: existing[0] });
      const colors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      const username = `google_${uid.slice(0, 8)}`;
      const { rows } = await db.query(
        'INSERT INTO users (username, nickname, avatar_color, firebase_uid) VALUES ($1, $2, $3, $4) RETURNING id, username, nickname, avatar_color',
        [username, nickname, color, uid]
      );
      res.json({ user: rows[0] });
    } catch (err) {
      console.error('Google auth error:', err.message, err.stack);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/users', async (req, res) => {
    const { rows } = await db.query('SELECT id, username, nickname, avatar_color FROM users');
    res.json({ users: rows });
  });

  app.get('/api/users/recent', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.json({ users: [] });
    const { rows } = await db.query(`
      SELECT DISTINCT u.id, u.username, u.nickname, u.avatar_color
      FROM messages m
      JOIN users u ON (u.id = m.sender_id OR u.id = m.receiver_id)
      WHERE (m.sender_id = $1 OR m.receiver_id = $1) AND u.id != $1
    `, [userId]);
    res.json({ users: rows });
  });

  app.put('/api/users/username', async (req, res) => {
    const { userId, username } = req.body;
    if (!userId || !username) return res.status(400).json({ error: 'Required' });
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return res.status(400).json({ error: '3-20 chars, letters, numbers, underscore' });
    try {
      const { rows: existing } = await db.query('SELECT id FROM users WHERE username = $1 AND id != $2', [username, userId]);
      if (existing.length) return res.status(409).json({ error: 'Username taken' });
      await db.query('UPDATE users SET username = $1 WHERE id = $2', [username, userId]);
      io.emit('username:changed', { userId, username });
      res.json({ username });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.delete('/api/chats/:chatId', async (req, res) => {
    const { chatId } = req.params;
    const userId = req.query.userId;
    if (!chatId || !userId) return res.status(400).json({ error: 'Required' });
    try {
      const { rows: member } = await db.query('SELECT user_id FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, userId]);
      if (!member.length) return res.status(403).json({ error: 'Not a member' });
      await db.query('DELETE FROM messages WHERE chat_id = $1', [chatId]);
      await db.query('DELETE FROM chat_members WHERE chat_id = $1', [chatId]);
      await db.query('DELETE FROM chats WHERE id = $1', [chatId]);
      io.emit('chat:deleted', { chatId });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.delete('/api/messages/:messageId', async (req, res) => {
    const { messageId } = req.params;
    const userId = req.query.userId;
    if (!messageId || !userId) return res.status(400).json({ error: 'Required' });
    try {
      const { rows: msg } = await db.query('SELECT sender_id FROM messages WHERE id = $1', [messageId]);
      if (!msg.length) return res.status(404).json({ error: 'Not found' });
      if (Number(msg[0].sender_id) !== Number(userId)) return res.status(403).json({ error: 'Not your message' });
      await db.query('DELETE FROM messages WHERE id = $1', [messageId]);
      io.emit('message:deleted', { messageId });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  io.on('connection', (socket) => {
    let currentUser = null;

    socket.on('user:online', async (user) => {
      currentUser = user;
      for (const [sid, u] of onlineUsers) {
        if (u.id === user.id) onlineUsers.delete(sid);
      }
      onlineUsers.set(socket.id, user);
      io.emit('users:online', getOnlineUsersList());

      const { rows: chats } = await db.query(`
        SELECT c.*, STRING_AGG(u.nickname, ',') as member_names
        FROM chats c
        JOIN chat_members cm ON c.id = cm.chat_id
        JOIN users u ON cm.user_id = u.id
        WHERE cm.chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = $1)
        GROUP BY c.id
      `, [user.id]);
      socket.emit('chats:list', chats);

      const { rows: history } = await db.query(`
        SELECT m.*, u.nickname as sender_name, u.avatar_color as sender_color
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        ORDER BY m.created_at ASC
        LIMIT 100
      `);
      history.forEach(m => { m.content = decryptText(m.content); });
      socket.emit('messages:history', history);
    });

    socket.on('private:start', async ({ userId }, callback) => {
      if (!currentUser) return;
      const ids = [currentUser.id, userId].sort();
      const { rows: chats } = await db.query(`
        SELECT c.* FROM chats c
        JOIN chat_members cm1 ON c.id = cm1.chat_id AND cm1.user_id = $1
        JOIN chat_members cm2 ON c.id = cm2.chat_id AND cm2.user_id = $2
        WHERE c.type = 'private'
      `, [ids[0], ids[1]]);
      let chat = chats[0];
      if (!chat) {
        const { rows } = await db.query("INSERT INTO chats (type) VALUES ('private') RETURNING id");
        chat = { id: rows[0].id, type: 'private' };
        await db.query('INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2), ($3, $4)', [chat.id, ids[0], chat.id, ids[1]]);
      }
      callback({ chatId: chat.id });
    });

    socket.on('message:send', async ({ chatId, content, receiverId }) => {
      if (!currentUser || !content.trim()) return;
      const enc = encryptText(content.trim());
      const { rows } = await db.query(
        'INSERT INTO messages (sender_id, receiver_id, chat_id, content) VALUES ($1, $2, $3, $4) RETURNING id',
        [currentUser.id, receiverId || null, chatId || null, enc]
      );
      const { rows: message } = await db.query(`
        SELECT m.*, u.nickname as sender_name, u.avatar_color as sender_color
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.id = $1
      `, [rows[0].id]);
      message[0].content = decryptText(message[0].content);
      io.emit('message:new', message[0]);

      if (botUser && receiverId && Number(receiverId) === Number(botUser.id)) {
        handleBotResponse(chatId, content.trim(), currentUser, db, io);
      }
    });

    socket.on('typing:start', (data) => {
      socket.broadcast.emit('typing:start', data);
    });

    socket.on('typing:stop', (data) => {
      socket.broadcast.emit('typing:stop', data);
    });

    socket.on('disconnect', () => {
      if (currentUser) {
        onlineUsers.delete(socket.id);
        io.emit('users:online', getOnlineUsersList());
      }
    });
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Pulse running on http://localhost:${PORT}`);
  });
}

main().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
