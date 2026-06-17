const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const { initDB } = require('./db');



async function main() {
  const db = await initDB();

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
    return Array.from(onlineUsers.values()).map(u => ({
      id: u.id, username: u.username, nickname: u.nickname, avatar_color: u.avatar_color
    }));
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
      if (msg[0].sender_id !== userId) return res.status(403).json({ error: 'Not your message' });
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
      const { rows } = await db.query(
        'INSERT INTO messages (sender_id, receiver_id, chat_id, content) VALUES ($1, $2, $3, $4) RETURNING id',
        [currentUser.id, receiverId || null, chatId || null, content.trim()]
      );
      const { rows: message } = await db.query(`
        SELECT m.*, u.nickname as sender_name, u.avatar_color as sender_color
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.id = $1
      `, [rows[0].id]);
      io.emit('message:new', message[0]);
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
