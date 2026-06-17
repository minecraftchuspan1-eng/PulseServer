let socket;
let currentUser = null;
let activeChatId = null;
let activeUserId = null;
let allMessages = [];
let allUsers = [];

const API = 'https://messenger-server-vwkj-production.up.railway.app';

const $ = id => document.getElementById(id);

const authScreen = $('auth-screen');
const appScreen = $('app-screen');
const authError = document.querySelector('.auth-error');
const onlineUsersDiv = $('online-users');
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
const searchInput = $('search-input');
const googleBtn = $('google-btn');
const settingsBtn = $('settings-btn');
const settingsPanel = $('settings-panel');
const settingsClose = $('settings-close');
const settingsAvatar = $('settings-avatar');
const settingsNickname = $('settings-nickname');
const settingsUsername = $('settings-username');
const settingsLogout = $('settings-logout');
const addUserInput = $('add-user-input');
const addUserBtn = $('add-user-btn');
const addUserError = $('add-user-error');

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
    const user = result.user;
    const res = await fetch(API + '/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: user.uid, displayName: user.displayName, email: user.email })
    });
    const data = await res.json();
    if (res.ok) setUser(data.user);
    else authError.textContent = data.error;
  }).catch((err) => {
    authError.textContent = err.message || 'Sign in failed';
  });
});

function setUser(user) {
  currentUser = user;
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  myAvatar.style.background = user.avatar_color;
  myAvatar.textContent = user.nickname[0].toUpperCase();
  myNickname.textContent = user.nickname;
  settingsAvatar.style.background = user.avatar_color;
  settingsAvatar.textContent = user.nickname[0].toUpperCase();
  settingsNickname.textContent = user.nickname;
  settingsUsername.textContent = '@' + user.username;
  connectSocket();
  loadUsers();
}

function connectSocket() {
  socket = io(API);
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
    const res = await fetch(API + '/api/users');
    const data = await res.json();
    allUsers = data.users.filter(u => u.id !== currentUser.id);
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

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const query = searchInput.value.trim().replace('@', '');
    if (!query) return;
    const user = allUsers.find(u => u.username === query || u.nickname.toLowerCase() === query.toLowerCase());
    if (user) {
      startChat(user);
      searchInput.value = '';
    } else {
      onlineUsersDiv.innerHTML = '<div style="color:#ef4444;font-size:13px;padding:4px 10px;">User not found</div>';
    }
  }
});

settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.remove('hidden');
});

settingsClose.addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
  addUserError.textContent = '';
});

settingsPanel.addEventListener('click', (e) => {
  if (e.target === settingsPanel) {
    settingsPanel.classList.add('hidden');
    addUserError.textContent = '';
  }
});

addUserBtn.addEventListener('click', async () => {
  const username = addUserInput.value.trim().replace('@', '');
  if (!username) return;
  addUserError.textContent = '';
  const user = allUsers.find(u => u.username === username);
  if (user) {
    startChat(user);
    settingsPanel.classList.add('hidden');
    addUserInput.value = '';
  } else {
    addUserError.textContent = 'User @' + username + ' not found';
  }
});

addUserInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addUserBtn.click();
});

function startChat(user) {
  activeUserId = user.id;
  chatPlaceholder.classList.add('hidden');
  chatActive.classList.remove('hidden');
  chatPartnerName.textContent = user.nickname;
  chatAvatar.style.background = user.avatar_color;
  chatAvatar.textContent = user.nickname[0].toUpperCase();
  chatStatus.textContent = 'offline';
  chatStatus.classList.remove('online');

  if (socket) {
    socket.emit('private:start', { userId: user.id }, ({ chatId }) => {
      activeChatId = chatId;
      renderMessages();
      scrollToBottom();
    });
  }

  if (socket) {
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

settingsLogout.addEventListener('click', () => {
  auth.signOut();
  if (socket) socket.disconnect();
  currentUser = null;
  activeChatId = null;
  activeUserId = null;
  allMessages = [];
  settingsPanel.classList.add('hidden');
  appScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
  authError.textContent = '';
});
