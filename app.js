let socket;
let currentUser = null;
let activeChatId = null;
let activeUserId = null;
let allMessages = [];
let allUsers = [];

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const authScreen = $('auth-screen');
const appScreen = $('app-screen');
const loginForm = $('login-form');
const registerForm = $('register-form');
const authError = document.querySelectorAll('.auth-error');
const onlineUsersDiv = $('online-users');
const allUsersDiv = $('all-users');
const messagesContainer = $('messages-container');
const messageInput = $('message-input');
const sendBtn = $('send-btn');
const chatPlaceholder = $('chat-placeholder');
const chatActive = $('chat-active');
const chatPartnerName = $('chat-partner-name');
const chatAvatar = $('chat-avatar');
const chatStatus = $('chat-status');
const myAvatar = $('my-avatar');
const myNickname = $('my-nickname');
const logoutBtn = $('logout-btn');
const searchInput = $('search-input');
const googleBtn = $('google-btn');

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelector('.auth-tab.active').classList.remove('active');
    tab.classList.add('active');
    if (tab.dataset.tab === 'login') {
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
    } else {
      loginForm.classList.add('hidden');
      registerForm.classList.remove('hidden');
    }
    authError.forEach(el => el.textContent = '');
  });
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const [username, password] = e.target.elements;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value, password: password.value })
    });
    const data = await res.json();
    if (res.ok) {
      setUser(data.user);
    } else {
      loginForm.querySelector('.auth-error').textContent = data.error;
    }
  } catch { loginForm.querySelector('.auth-error').textContent = 'Connection error'; }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const [username, password, nickname] = e.target.elements;
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value, password: password.value, nickname: nickname.value })
    });
    const data = await res.json();
    if (res.ok) {
      setUser(data.user);
    } else {
      registerForm.querySelector('.auth-error').textContent = data.error;
    }
  } catch { registerForm.querySelector('.auth-error').textContent = 'Connection error'; }
});

const firebaseConfig = {
  apiKey: "AIzaSyDi8v1i0hHUXFwkrxS2T4ZywFpKMyFIMA0",
  authDomain: "so2market.firebaseapp.com",
  projectId: "so2market",
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

googleBtn.addEventListener('click', () => {
  auth.signInWithPopup(googleProvider).then(async (result) => {
    const idToken = await result.user.getIdToken();
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    const data = await res.json();
    if (res.ok) setUser(data.user);
    else document.querySelector('.auth-error').textContent = data.error;
  }).catch(() => {});
});

function setUser(user) {
  currentUser = user;
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  myAvatar.style.background = user.avatar_color;
  myAvatar.textContent = user.nickname[0].toUpperCase();
  myNickname.textContent = user.nickname;
  connectSocket();
  loadUsers();
}

function connectSocket() {
  socket = io();
  socket.emit('user:online', currentUser);

  socket.on('users:online', (users) => {
    renderOnlineUsers(users);
  });

  socket.on('messages:history', (messages) => {
    allMessages = messages;
    if (activeChatId) renderMessages();
  });

  socket.on('message:new', (message) => {
    allMessages.push(message);
    if (activeChatId && (message.chat_id === activeChatId)) {
      renderMessages();
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  });

  socket.on('chats:list', () => {});
}

async function loadUsers() {
  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    allUsers = data.users.filter(u => u.id !== currentUser.id);
    renderAllUsers(allUsers);
  } catch {}
}

function renderOnlineUsers(onlineList) {
  onlineUsersDiv.innerHTML = '';
  const others = onlineList.filter(u => u.id !== currentUser.id);
  if (others.length === 0) {
    onlineUsersDiv.innerHTML = '<div style="color:#52525b;font-size:13px;padding:4px 10px;">No one online</div>';
    return;
  }
  others.forEach(u => {
    const el = document.createElement('div');
    el.className = 'user-item';
    el.innerHTML = `
      <div class="avatar" style="background:${u.avatar_color}">${u.nickname[0].toUpperCase()}</div>
      <span class="user-name">${u.nickname}</span>
      <div class="online-dot"></div>
    `;
    el.addEventListener('click', () => startChat(u));
    onlineUsersDiv.appendChild(el);
  });
}

function renderAllUsers(users) {
  allUsersDiv.innerHTML = '';
  const filtered = searchInput.value
    ? users.filter(u => u.nickname.toLowerCase().includes(searchInput.value.toLowerCase()) || u.username.toLowerCase().includes(searchInput.value.toLowerCase()))
    : users;
  if (filtered.length === 0) {
    allUsersDiv.innerHTML = '<div style="color:#52525b;font-size:13px;padding:4px 10px;">No users found</div>';
    return;
  }
  filtered.forEach(u => {
    const el = document.createElement('div');
    el.className = 'user-item';
    el.innerHTML = `
      <div class="avatar" style="background:${u.avatar_color}">${u.nickname[0].toUpperCase()}</div>
      <span class="user-name">${u.nickname}</span>
    `;
    el.addEventListener('click', () => startChat(u));
    allUsersDiv.appendChild(el);
  });
}

searchInput.addEventListener('input', () => renderAllUsers(allUsers));

function startChat(user) {
  activeUserId = user.id;
  chatPlaceholder.classList.add('hidden');
  chatActive.classList.remove('hidden');
  chatPartnerName.textContent = user.nickname;
  chatAvatar.style.background = user.avatar_color;
  chatAvatar.textContent = user.nickname[0].toUpperCase();
  chatStatus.textContent = 'offline';
  chatStatus.classList.remove('online');

  document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));

  if (socket) {
    socket.emit('private:start', { userId: user.id }, ({ chatId }) => {
      activeChatId = chatId;
      renderMessages();
      scrollToBottom();
    });
  }

  if (socket) {
    const onlineUsers = document.querySelectorAll('.online-dot');
    socket.on('users:online', (users) => {
      const isOnline = users.some(u => u.id === user.id);
      chatStatus.textContent = isOnline ? 'online' : 'offline';
      if (isOnline) chatStatus.classList.add('online');
      else chatStatus.classList.remove('online');
    });
  }
}

function renderMessages() {
  const chatMessages = allMessages.filter(m => m.chat_id === activeChatId);
  messagesContainer.innerHTML = '';
  if (chatMessages.length === 0) {
    messagesContainer.innerHTML = '<div class="system-message">No messages yet. Say hello!</div>';
    return;
  }
  chatMessages.forEach(m => {
    const isOwn = m.sender_id === currentUser.id;
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : 'other'}`;
    const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
      ${!isOwn ? `<div class="msg-sender">${m.sender_name}</div>` : ''}
      ${m.content}
      <div class="msg-time">${time}</div>
    `;
    messagesContainer.appendChild(div);
  });
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || !activeChatId || !socket) return;
  socket.emit('message:send', {
    chatId: activeChatId,
    content,
    receiverId: activeUserId
  });
  messageInput.value = '';
}

logoutBtn.addEventListener('click', () => {
  auth.signOut();
  if (socket) socket.disconnect();
  currentUser = null;
  activeChatId = null;
  activeUserId = null;
  allMessages = [];
  appScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
  loginForm.querySelector('.auth-error').textContent = '';
  loginForm.reset();
  registerForm.reset();
});
