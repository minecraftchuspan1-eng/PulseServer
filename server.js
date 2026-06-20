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

const ADMIN_USERNAMES = ['teardown777', 'pulse', 'minecraftch'];
const ADMIN_EMAILS = ['minecraftchuspan1@gmail.com', 'artemiiest@gmail.com'];

// Image upload safety: only real image MIME types, capped size (prevents text/html XSS + storage DoS)
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
const MAX_IMAGE_CHARS = 5 * 1024 * 1024; // ~5 MB of base64 string

function isValidImageData(s) {
  if (typeof s !== 'string' || s.length > MAX_IMAGE_CHARS) return false;
  const m = s.match(/^data:([^;]+);base64,/i);
  return !!(m && ALLOWED_IMAGE_TYPES.includes(m[1].toLowerCase()));
}

const GIGACHAT_AUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const GIGACHAT_API_URL = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';
// SECURITY: rotate this key in Sber's cabinet — it was committed to git history and must be considered leaked.
// Set GIGACHAT_AUTH_KEY in the environment; the literal below is only a fallback for local runs.
const GIGACHAT_AUTH_KEY = process.env.GIGACHAT_AUTH_KEY || 'MDE5ZTc4MDMtYWRlZi03YTc1LTg0NDgtOTMyYzcxODFmNjJiOjMzMmFmMWNjLWZiZjctNGNlMi1iMjQ1LTJiZWUwZDYyYTI0Mg==';
const GIGACHAT_SCOPE = 'GIGACHAT_API_PERS';

let gigaChatToken = null;
let gigaChatTokenExpires = 0;
let botUser = null;



async function ensureBotUser(db) {
  const { rows: existing } = await db.query('SELECT id, username, nickname, avatar_color, avatar_url, avatar_version, label FROM users WHERE firebase_uid = $1', [BOT_UID]);
  if (existing.length) { botUser = existing[0]; return; }
  const { rows } = await db.query(
    'INSERT INTO users (username, nickname, avatar_color, firebase_uid) VALUES ($1, $2, $3, $4) RETURNING id, username, nickname, avatar_color, avatar_url, avatar_version, label',
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

const DISCLAIMER = /(?:GigaChat|Gigachat|gigachat:?\s*)?Как и любая языковая модель, [^.]+\. Ответ сгенерирован нейросетевой моделью[^.]+\. Во избежание неправильного толкования, разговоры на некоторые темы временно ограничены\.?\s*/i;

function stripDisclaimer(text) {
  return text.replace(DISCLAIMER, '').trim();
}

async function callGigaChat(messages) {
  const token = await getGigaChatToken();
  const body = JSON.stringify({
    model: 'GigaChat',
    messages,
    temperature: 0.7,
    max_tokens: 1000,
  });
  const { status, data } = await httpsPost(GIGACHAT_API_URL, body, {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  });
  if (status !== 200) throw new Error('GigaChat API error: ' + JSON.stringify(data));
  return stripDisclaimer(data.choices[0].message.content);
}

async function handleBotResponse(chatId, userMessage, sender, db, io) {
  try {
    const { rows: history } = await db.query(
      'SELECT content, sender_id FROM messages WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 10',
      [chatId]
    );
    const messages = [
      { role: 'system', content: 'Ты — Pulse Chat Bot, дружелюбный помощник в мессенджере Pulse. Отвечай кратко и полезно. Никогда не упоминай, что ты создан какой-либо компанией, и не говори о своей модели. Просто помогай пользователям.' },
    ];
    history.reverse().forEach(m => {
      const decrypted = decryptText(m.content);
      messages.push({ role: m.sender_id === sender.id ? 'user' : 'assistant', content: decrypted });
    });
    messages.push({ role: 'user', content: userMessage });

    const reply = await callGigaChat(messages);
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
  app.use(express.json({ limit: '10mb' }));

  const onlineUsers = new Map();

  function getOnlineUsersList() {
    const list = Array.from(onlineUsers.values()).map(u => ({
      id: u.id, username: u.username, nickname: u.nickname, avatar_color: u.avatar_color, avatar_url: (u.avatar_url && u.avatar_url.startsWith('data:')) ? '/api/avatar/' + u.id + '?v=' + (u.avatar_version || 0) : (u.avatar_url || ''), label: u.label || ''
    }));
    if (botUser) list.unshift(formatUser(botUser));
    return list;
  }

  function formatUser(u) {
    return { id: u.id, username: u.username, nickname: u.nickname, avatar_color: u.avatar_color, avatar_url: (u.avatar_url && u.avatar_url.startsWith('data:')) ? '/api/avatar/' + u.id + '?v=' + (u.avatar_version || 0) : (u.avatar_url || ''), label: u.label || '', email: u.email || '' };
  }

  function isAdmin(userId) {
    return new Promise(async (resolve) => {
      try {
        const { rows } = await db.query('SELECT LOWER(username) as uname, email FROM users WHERE id = $1', [userId]);
        if (!rows.length) return resolve(false);
        if (ADMIN_USERNAMES.includes(rows[0].uname)) return resolve(true);
        if (rows[0].email && ADMIN_EMAILS.includes(rows[0].email.toLowerCase())) return resolve(true);
        resolve(false);
      } catch { resolve(false); }
    });
  }

  app.post('/api/register', async (req, res) => {
    const { username, password, nickname } = req.body;
    if (!username || !password || !nickname) {
      return res.status(400).json({ error: 'All fields required' });
    }
    try {
      const { rows: existingUsers } = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
      const { rows: existingChats } = await db.query('SELECT id FROM chats WHERE LOWER(username) = LOWER($1)', [username]);
      if (existingUsers.length || existingChats.length) {
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
      res.json({ user: formatUser(u) });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/auth/google', async (req, res) => {
    const { uid, displayName, email } = req.body;
    if (!uid) return res.status(400).json({ error: 'No uid' });
    try {
      const nickname = displayName || email || uid.slice(0, 8);
      const { rows: existing } = await db.query('SELECT id, username, nickname, avatar_color, avatar_url, avatar_version, label, email FROM users WHERE firebase_uid = $1', [uid]);
      if (existing.length) {
        if (email && existing[0].email !== email) {
          await db.query('UPDATE users SET email = $1 WHERE id = $2', [email, existing[0].id]);
          existing[0].email = email;
        }
        return res.json({ user: formatUser(existing[0]) });
      }
      const colors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      const username = `google_${uid.slice(0, 8)}`;
      const { rows } = await db.query(
        'INSERT INTO users (username, nickname, avatar_color, firebase_uid, email) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, nickname, avatar_color, avatar_url, avatar_version, label, email',
        [username, nickname, color, uid, email || '']
      );
      res.json({ user: formatUser(rows[0]) });
    } catch (err) {
      console.error('Google auth error:', err.message, err.stack);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/users', async (req, res) => {
    const { rows } = await db.query('SELECT id, username, nickname, avatar_color, avatar_url, avatar_version, label FROM users');
    res.json({ users: rows.map(formatUser) });
  });

  app.post('/api/messages/photo', async (req, res) => {
    const { chatId, userId, imageData, caption } = req.body;
    if (!chatId || !userId || !imageData) return res.status(400).json({ error: 'Missing required fields' });
    if (!isValidImageData(imageData)) return res.status(400).json({ error: 'Invalid or too large image' });
    if (caption && String(caption).length > 2000) return res.status(400).json({ error: 'Caption too long' });
    try {
      const { rows: chatInfo } = await db.query('SELECT type FROM chats WHERE id = $1', [chatId]);
      if (!chatInfo.length) return res.status(404).json({ error: 'Chat not found' });
      if (chatInfo[0].type === 'channel') {
        const { rows: member } = await db.query("SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2 AND role IN ('owner', 'admin')", [chatId, userId]);
        if (!member.length) return res.status(403).json({ error: 'Only admins can post in channels' });
      }
      const { rows: banned } = await db.query('SELECT user_id FROM chat_bans WHERE chat_id = $1 AND user_id = $2', [chatId, userId]);
      if (banned.length) return res.status(403).json({ error: 'You are banned' });
      const { rows } = await db.query(
        'INSERT INTO photo_messages (chat_id, sender_id, photo_url, caption) VALUES ($1, $2, $3, $4) RETURNING id, chat_id, sender_id, photo_url, caption, created_at',
        [chatId, userId, imageData, caption || '']
      );
      const { rows: msg } = await db.query(`
        SELECT pm.id, pm.chat_id, pm.sender_id, pm.photo_url, pm.caption, pm.created_at,
               u.nickname as sender_name, u.avatar_color as sender_color
        FROM photo_messages pm JOIN users u ON pm.sender_id = u.id
        WHERE pm.id = $1
      `, [rows[0].id]);
      const message = {
        ...msg[0],
        type: 'photo',
        image_url: msg[0].photo_url
      };
      io.emit('photo:send', { message });
      res.json(message);
    } catch (err) {
      console.error('Photo upload error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/users/recent', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.json({ users: [] });
    const { rows } = await db.query(`
      SELECT DISTINCT u.id, u.username, u.nickname, u.avatar_color, u.avatar_url, u.avatar_version, u.label
      FROM messages m
      JOIN users u ON (u.id = m.sender_id OR u.id = m.receiver_id)
      WHERE (m.sender_id = $1 OR m.receiver_id = $1) AND u.id != $1
    `, [userId]);
    res.json({ users: rows.map(formatUser) });
  });

  app.put('/api/users/username', async (req, res) => {
    const { userId, username } = req.body;
    if (!userId || !username) return res.status(400).json({ error: 'Required' });
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return res.status(400).json({ error: '3-20 chars, letters, numbers, underscore' });
    try {
      const { rows: existingUsers } = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2', [username, userId]);
      const { rows: existingChats } = await db.query('SELECT id FROM chats WHERE LOWER(username) = LOWER($1)', [username]);
      if (existingUsers.length || existingChats.length) return res.status(409).json({ error: 'Username taken' });
      await db.query('UPDATE users SET username = $1 WHERE id = $2', [username, userId]);
      io.emit('username:changed', { userId, username });
      res.json({ username });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.put('/api/users/nickname', async (req, res) => {
    const { userId, nickname } = req.body;
    if (!userId || !nickname) return res.status(400).json({ error: 'Required' });
    if (nickname.length < 1 || nickname.length > 30) return res.status(400).json({ error: '1-30 chars' });
    try {
      await db.query('UPDATE users SET nickname = $1 WHERE id = $2', [nickname, userId]);
      io.emit('nickname:changed', { userId, nickname });
      res.json({ nickname });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/avatar/:userId', async (req, res) => {
    try {
      const { rows } = await db.query('SELECT avatar_url FROM users WHERE id = $1', [req.params.userId]);
      if (!rows.length || !rows[0].avatar_url) return res.status(404).json({ error: 'Not found' });
      const dataUrl = rows[0].avatar_url;
      const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
      if (!matches || !ALLOWED_IMAGE_TYPES.includes(matches[1].toLowerCase())) {
        return res.status(400).json({ error: 'Invalid avatar' });
      }
      const buf = Buffer.from(matches[2], 'base64');
      res.setHeader('Content-Type', matches[1].toLowerCase());
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/admin/users', async (req, res) => {
    const userId = req.query.adminId;
    if (!userId || !(await isAdmin(userId))) return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await db.query('SELECT id, username, nickname, avatar_color, avatar_url, avatar_version, label, email FROM users ORDER BY id');
    res.json({ users: rows.map(formatUser) });
  });

  app.put('/api/admin/users/:targetId/label', async (req, res) => {
    const adminId = req.query.adminId;
    if (!adminId || !(await isAdmin(adminId))) return res.status(403).json({ error: 'Forbidden' });
    const { label } = req.body;
    if (!['verified', 'scam', ''].includes(label)) return res.status(400).json({ error: 'Invalid label' });
    await db.query('UPDATE users SET label = $1 WHERE id = $2', [label, req.params.targetId]);
    io.emit('label:changed', { userId: Number(req.params.targetId), label });
    res.json({ label });
  });

  function avatarApiUrl(userId, version) {
    return '/api/avatar/' + userId + '?v=' + (version || 0);
  }

  app.put('/api/users/avatar', async (req, res) => {
    const { userId, avatarUrl } = req.body;
    if (!userId) return res.status(400).json({ error: 'Required' });
    if (avatarUrl && !isValidImageData(avatarUrl)) return res.status(400).json({ error: 'Invalid or too large image' });
    try {
      const hasAvatar = avatarUrl && avatarUrl.startsWith('data:');
      const { rows: cur } = await db.query('SELECT avatar_version FROM users WHERE id = $1', [userId]);
      const newVer = (cur.length ? (cur[0].avatar_version || 0) : 0) + 1;
      const clientUrl = hasAvatar ? avatarApiUrl(userId, newVer) : '';
      await db.query('UPDATE users SET avatar_url = $1, avatar_version = $2 WHERE id = $3', [avatarUrl || '', newVer, userId]);
      for (const [sid, u] of onlineUsers) {
        if (u.id === Number(userId)) {
          u.avatar_url = clientUrl;
          onlineUsers.set(sid, u);
        }
      }
      io.emit('avatar:changed', { userId, avatarUrl: clientUrl });
      io.emit('users:online', getOnlineUsersList());
      res.json({ avatarUrl: clientUrl });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.delete('/api/chats/:chatId', async (req, res) => {
    const { chatId } = req.params;
    const userId = req.query.userId;
    if (!chatId || !userId) return res.status(400).json({ error: 'Required' });
    try {
      const { rows: chat } = await db.query('SELECT type, owner_id FROM chats WHERE id = $1', [chatId]);
      if (!chat.length) return res.status(404).json({ error: 'Chat not found' });
      if (chat[0].type === 'group' || chat[0].type === 'channel') {
        if (Number(chat[0].owner_id) !== Number(userId)) return res.status(403).json({ error: 'Only owner can delete' });
      } else {
        const { rows: member } = await db.query('SELECT user_id FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, userId]);
        if (!member.length) return res.status(403).json({ error: 'Not a member' });
      }
      await db.query('DELETE FROM messages WHERE chat_id = $1', [chatId]);
      await db.query('DELETE FROM photo_messages WHERE chat_id = $1', [chatId]);
      await db.query('DELETE FROM chat_members WHERE chat_id = $1', [chatId]);
      await db.query('DELETE FROM chat_bans WHERE chat_id = $1', [chatId]);
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

  app.post('/api/username/check', async (req, res) => {
    const { username } = req.body;
    if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) return res.json({ available: false });
    try {
      const { rows: users } = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
      const { rows: chats } = await db.query('SELECT id FROM chats WHERE LOWER(username) = LOWER($1)', [username]);
      res.json({ available: users.length === 0 && chats.length === 0 });
    } catch { res.json({ available: false }); }
  });

  app.post('/api/chats/create', async (req, res) => {
    const { userId, name, type, username, description } = req.body;
    if (!userId || !name || !type || !['group', 'channel'].includes(type)) return res.status(400).json({ error: 'Invalid params' });
    if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) return res.status(400).json({ error: '3-20 chars, letters, numbers, underscore' });
    try {
      if (username) {
        const { rows: users } = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
        const { rows: chats } = await db.query('SELECT id FROM chats WHERE LOWER(username) = LOWER($1)', [username]);
        if (users.length || chats.length) return res.status(409).json({ error: 'Username taken' });
      }
      const { rows } = await db.query(
        `INSERT INTO chats (name, type, username, owner_id, description) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name, type, username || null, userId, description || '']
      );
      await db.query('INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1, $2, $3)', [rows[0].id, userId, 'owner']);
      const chat = rows[0];
      if (chat.avatar_url && chat.avatar_url.startsWith('data:')) {
        chat.avatar_url = '/api/chat-avatar/' + chat.id + '?v=' + (chat.avatar_version || 0);
      }
      io.emit('chat:created', { ...chat, member_names: '' });
      res.json({ chat });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/chats/:id/join', async (req, res) => {
    const chatId = req.params.id;
    const { userId } = req.body;
    if (!chatId || !userId) return res.status(400).json({ error: 'Required' });
    try {
      const { rows: chat } = await db.query('SELECT id, type FROM chats WHERE id = $1', [chatId]);
      if (!chat.length) return res.status(404).json({ error: 'Chat not found' });
      const { rows: member } = await db.query('SELECT user_id FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, userId]);
      if (member.length) return res.status(409).json({ error: 'Already a member' });
      const { rows: banned } = await db.query('SELECT user_id FROM chat_bans WHERE chat_id = $1 AND user_id = $2', [chatId, userId]);
      if (banned.length) return res.status(403).json({ error: 'You are banned' });
      await db.query('INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2)', [chatId, userId]);
      const { rows: members } = await db.query(`
        SELECT u.id, u.nickname, u.username, u.avatar_color, u.avatar_url, u.avatar_version, u.label, cm.role
        FROM chat_members cm JOIN users u ON cm.user_id = u.id
        WHERE cm.chat_id = $1
      `, [chatId]);
      io.emit('chat:member:joined', { chatId: Number(chatId), userId: Number(userId), members });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/chats/:id/leave', async (req, res) => {
    const chatId = req.params.id;
    const { userId } = req.body;
    if (!chatId || !userId) return res.status(400).json({ error: 'Required' });
    try {
      const { rows: member } = await db.query('SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, userId]);
      if (!member.length) return res.status(404).json({ error: 'Not a member' });
      if (member[0].role === 'owner') return res.status(403).json({ error: 'Owner cannot leave; transfer ownership first' });
      await db.query('DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, userId]);
      io.emit('chat:member:left', { chatId: Number(chatId), userId: Number(userId) });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.put('/api/chats/:id/role', async (req, res) => {
    const chatId = req.params.id;
    const { requesterId, targetId, role } = req.body;
    if (!chatId || !requesterId || !targetId || !role || !['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid params' });
    try {
      const { rows: requester } = await db.query('SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, requesterId]);
      if (!requester.length || requester[0].role !== 'owner') return res.status(403).json({ error: 'Only owner can change roles' });
      const { rows: target } = await db.query('SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, targetId]);
      if (!target.length) return res.status(404).json({ error: 'Target not a member' });
      if (target[0].role === 'owner') return res.status(403).json({ error: 'Cannot change owner role' });
      await db.query('UPDATE chat_members SET role = $1 WHERE chat_id = $2 AND user_id = $3', [role, chatId, targetId]);
      const { rows: members } = await db.query(`
        SELECT u.id, u.nickname, u.username, u.avatar_color, u.avatar_url, u.avatar_version, u.label, cm.role
        FROM chat_members cm JOIN users u ON cm.user_id = u.id
        WHERE cm.chat_id = $1
      `, [chatId]);
      io.emit('chat:member:role', { chatId: Number(chatId), targetId: Number(targetId), role, members });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/chats/:id/ban', async (req, res) => {
    const chatId = req.params.id;
    const { requesterId, targetId } = req.body;
    if (!chatId || !requesterId || !targetId) return res.status(400).json({ error: 'Required' });
    try {
      const { rows: requester } = await db.query('SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, requesterId]);
      if (!requester.length || (requester[0].role !== 'owner' && requester[0].role !== 'admin')) return res.status(403).json({ error: 'Only owner/admin can ban' });
      const { rows: target } = await db.query('SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, targetId]);
      if (!target.length) return res.status(404).json({ error: 'Target not a member' });
      if (target[0].role === 'owner') return res.status(403).json({ error: 'Cannot ban owner' });
      await db.query('DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, targetId]);
      await db.query('INSERT INTO chat_bans (chat_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [chatId, targetId]);
      const { rows: members } = await db.query(`
        SELECT u.id, u.nickname, u.username, u.avatar_color, u.avatar_url, u.avatar_version, u.label, cm.role
        FROM chat_members cm JOIN users u ON cm.user_id = u.id
        WHERE cm.chat_id = $1
      `, [chatId]);
      io.emit('chat:member:banned', { chatId: Number(chatId), targetId: Number(targetId), members });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/chats/:id/unban', async (req, res) => {
    const chatId = req.params.id;
    const { requesterId, targetId } = req.body;
    if (!chatId || !requesterId || !targetId) return res.status(400).json({ error: 'Required' });
    try {
      const { rows: requester } = await db.query('SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, requesterId]);
      if (!requester.length || (requester[0].role !== 'owner' && requester[0].role !== 'admin')) return res.status(403).json({ error: 'Only owner/admin can unban' });
      await db.query('DELETE FROM chat_bans WHERE chat_id = $1 AND user_id = $2', [chatId, targetId]);
      io.emit('chat:member:unbanned', { chatId: Number(chatId), targetId: Number(targetId) });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.put('/api/chats/:id/avatar', async (req, res) => {
    const chatId = req.params.id;
    const { userId, avatarUrl } = req.body;
    if (!chatId || !userId) return res.status(400).json({ error: 'Required' });
    if (avatarUrl && !isValidImageData(avatarUrl)) return res.status(400).json({ error: 'Invalid or too large image' });
    try {
      const { rows: member } = await db.query("SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2 AND role IN ('owner', 'admin')", [chatId, userId]);
      if (!member.length) return res.status(403).json({ error: 'Only owner/admin can change avatar' });
      const hasAvatar = avatarUrl && avatarUrl.startsWith('data:');
      const { rows: cur } = await db.query('SELECT avatar_version FROM chats WHERE id = $1', [chatId]);
      const newVer = (cur.length ? (cur[0].avatar_version || 0) : 0) + 1;
      await db.query('UPDATE chats SET avatar_url = $1, avatar_version = $2 WHERE id = $3', [avatarUrl || '', newVer, chatId]);
      const clientUrl = hasAvatar ? '/api/chat-avatar/' + chatId + '?v=' + newVer : '';
      io.emit('chat:avatar:changed', { chatId: Number(chatId), avatarUrl: clientUrl });
      res.json({ avatarUrl: clientUrl });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/admin/chats', async (req, res) => {
    const userId = req.query.adminId;
    if (!userId || !(await isAdmin(userId))) return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await db.query('SELECT id, name, type, username, owner_id, description, label FROM chats WHERE type IN (\'group\', \'channel\') ORDER BY id');
    res.json({ chats: rows });
  });

  app.put('/api/chats/:id/label', async (req, res) => {
    const adminId = req.query.adminId;
    if (!adminId || !(await isAdmin(adminId))) return res.status(403).json({ error: 'Forbidden' });
    const { label } = req.body;
    if (!['verified', 'scam', ''].includes(label)) return res.status(400).json({ error: 'Invalid label' });
    await db.query('UPDATE chats SET label = $1 WHERE id = $2', [label, req.params.id]);
    io.emit('chat:label:changed', { chatId: Number(req.params.id), label });
    res.json({ label });
  });

  app.get('/api/chat-avatar/:chatId', async (req, res) => {
    try {
      const { rows } = await db.query('SELECT avatar_url FROM chats WHERE id = $1', [req.params.chatId]);
      if (!rows.length || !rows[0].avatar_url) return res.status(404).json({ error: 'Not found' });
      const matches = rows[0].avatar_url.match(/^data:(.+);base64,(.+)$/);
      if (!matches || !ALLOWED_IMAGE_TYPES.includes(matches[1].toLowerCase())) {
        return res.status(400).json({ error: 'Invalid avatar' });
      }
      const buf = Buffer.from(matches[2], 'base64');
      res.setHeader('Content-Type', matches[1].toLowerCase());
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/chats/:id/members', async (req, res) => {
    const chatId = req.params.id;
    const { userId } = req.query;
    if (!chatId || !userId) return res.status(400).json({ error: 'Required' });
    try {
      const { rows: member } = await db.query('SELECT user_id FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, userId]);
      if (!member.length) return res.status(403).json({ error: 'Not a member' });
      const { rows: members } = await db.query(`
        SELECT u.id, u.nickname, u.username, u.avatar_color, u.avatar_url, u.avatar_version, u.label, cm.role
        FROM chat_members cm JOIN users u ON cm.user_id = u.id
        WHERE cm.chat_id = $1
      `, [chatId]);
      res.json({ members });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/chats/:id/messages', async (req, res) => {
    const chatId = req.params.id;
    const userId = req.query.userId;
    if (!chatId || !userId) return res.status(400).json({ error: 'Required' });
    try {
      const { rows: member } = await db.query('SELECT user_id FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, userId]);
      if (!member.length) return res.status(403).json({ error: 'Not a member' });
      const { rows: messages } = await db.query(`
        SELECT m.*, u.nickname as sender_name, u.avatar_color as sender_color
        FROM messages m JOIN users u ON m.sender_id = u.id
        WHERE m.chat_id = $1 ORDER BY m.created_at DESC LIMIT 100
      `, [chatId]);
      const { rows: photos } = await db.query(`
        SELECT pm.*, u.nickname as sender_name, u.avatar_color as sender_color
        FROM photo_messages pm JOIN users u ON pm.sender_id = u.id
        WHERE pm.chat_id = $1 ORDER BY pm.created_at DESC LIMIT 100
      `, [chatId]);
      photos.forEach(function(m) { m.type = 'photo'; m.image_url = m.photo_url; });
      var all = [...messages, ...photos].sort(function(a, b) { return new Date(a.created_at) - new Date(b.created_at); });
      all.forEach(function(m) { if (m.content) m.content = decryptText(m.content); });
      res.json({ messages: all });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/chats/search', async (req, res) => {
    const { q, userId } = req.query;
    if (!q || !userId) return res.json({ chats: [] });
    try {
      const { rows } = await db.query(
        `SELECT c.id, c.name, c.type, c.username, c.description, c.owner_id, c.avatar_url, c.avatar_version, c.label
         FROM chats c
         WHERE c.type IN ('group', 'channel') AND LOWER(c.username) LIKE LOWER($1)
         LIMIT 20`,
        [q + '%']
      );
      rows.forEach(function(c) {
        if (c.avatar_url && c.avatar_url.startsWith('data:')) {
          c.avatar_url = '/api/chat-avatar/' + c.id + '?v=' + (c.avatar_version || 0);
        }
      });
      res.json({ chats: rows });
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
      const { rows: userRow } = await db.query('SELECT avatar_version, label FROM users WHERE id = $1', [user.id]);
      const ver = userRow.length ? (userRow[0].avatar_version || 0) : 0;
      user.label = userRow.length ? (userRow[0].label || '') : '';
      user.avatar_url = (user.avatar_url && user.avatar_url.startsWith('data:')) ? '/api/avatar/' + user.id + '?v=' + ver : (user.avatar_url || '');
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
      chats.forEach(function(c) {
        if (c.avatar_url && c.avatar_url.startsWith('data:')) {
          c.avatar_url = '/api/chat-avatar/' + c.id + '?v=' + (c.avatar_version || 0);
        }
      });
      socket.emit('chats:list', chats);

      // Get regular messages (private + group/channel)
      const { rows: history } = await db.query(`
        SELECT m.*, u.nickname as sender_name, u.avatar_color as sender_color
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.sender_id = $1 OR m.receiver_id = $1 OR m.chat_id IN (
          SELECT chat_id FROM chat_members WHERE user_id = $1
        )
        ORDER BY m.created_at DESC
        LIMIT 100
      `, [currentUser.id]);

      // Get photo messages
      const { rows: photoHistory } = await db.query(`
        SELECT pm.*, u.nickname as sender_name, u.avatar_color as sender_color
        FROM photo_messages pm
        JOIN users u ON pm.sender_id = u.id
        WHERE pm.sender_id = $1 OR pm.chat_id IN (
          SELECT chat_id FROM chat_members WHERE user_id = $1
        )
        ORDER BY pm.created_at DESC
        LIMIT 100
      `, [currentUser.id]);

      photoHistory.forEach(m => {
        m.type = 'photo';
        m.image_url = m.photo_url;
      });

      const allHistory = [...history, ...photoHistory].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      history.reverse();
      history.forEach(m => { m.content = decryptText(m.content); });
      socket.emit('messages:history', allHistory);
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
      if (!currentUser || typeof content !== 'string' || !content.trim()) return;
      if (content.length > 10000) { socket.emit('error', 'Message too long'); return; }
      if (chatId) {
        const { rows: chatInfo } = await db.query('SELECT type FROM chats WHERE id = $1', [chatId]);
        if (chatInfo.length && chatInfo[0].type === 'channel') {
          const { rows: member } = await db.query("SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2 AND role IN ('owner', 'admin')", [chatId, currentUser.id]);
          if (!member.length) { socket.emit('error', 'Only admins can post in channels'); return; }
        }
        const { rows: banned } = await db.query('SELECT user_id FROM chat_bans WHERE chat_id = $1 AND user_id = $2', [chatId, currentUser.id]);
        if (banned.length) { socket.emit('error', 'You are banned from this chat'); return; }
      }
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



    socket.on('photo:send', async ({ chatId, photoUrl, caption }) => {
      if (!currentUser || !photoUrl) return;
      if (!isValidImageData(photoUrl)) { socket.emit('error', 'Invalid or too large image'); return; }
      if (chatId) {
        const { rows: chatInfo } = await db.query('SELECT type FROM chats WHERE id = $1', [chatId]);
        if (chatInfo.length && chatInfo[0].type === 'channel') {
          const { rows: member } = await db.query("SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2 AND role IN ('owner', 'admin')", [chatId, currentUser.id]);
          if (!member.length) { socket.emit('error', 'Only admins can post in channels'); return; }
        }
        const { rows: banned } = await db.query('SELECT user_id FROM chat_bans WHERE chat_id = $1 AND user_id = $2', [chatId, currentUser.id]);
        if (banned.length) { socket.emit('error', 'You are banned from this chat'); return; }
      }
      try {
        const { rows } = await db.query(
          'INSERT INTO photo_messages (chat_id, sender_id, photo_url, caption) VALUES ($1, $2, $3, $4) RETURNING id, chat_id, sender_id, photo_url, caption, created_at',
          [chatId, currentUser.id, photoUrl, caption]
        );
        const { rows: msg } = await db.query(`
          SELECT pm.id, pm.chat_id, pm.sender_id, pm.photo_url, pm.caption, pm.created_at,
                 u.nickname as sender_name, u.avatar_color as sender_color
          FROM photo_messages pm JOIN users u ON pm.sender_id = u.id
          WHERE pm.id = $1
        `, [rows[0].id]);
        io.emit('photo:message', msg[0]);
      } catch (err) {
        console.error('Photo send error:', err);
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
