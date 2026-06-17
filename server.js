const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const path = require('path');
const { initDB, getDB } = require('./db');

async function main() {
  const db = await initDB();

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  app.use(express.json());
  app.use(express.static(__dirname));

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

  app.get('/api/users', async (req, res) => {
    const { rows } = await db.query('SELECT id, username, nickname, avatar_color FROM users');
    res.json({ users: rows });
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
