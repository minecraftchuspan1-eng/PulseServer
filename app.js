let socket;
let currentUser = null;
let activeChatId = null;
let activeUserId = null;
let activeUserObj = null;
let allMessages = [];
let allUsers = [];
let onlineUsersList = [];
let unreadCounts = {};

const API = 'https://messenger-server-vwkj-production.up.railway.app';
const $ = id => document.getElementById(id);

function createAvatarHtml(u) {
  var div = document.createElement('div');
  div.className = 'avatar';
  var url = u.avatar_url;
  if (url) {
    if (url.startsWith('/')) url = API + url;
    div.style.backgroundImage = 'url(' + url + ')';
    div.style.backgroundSize = 'cover';
    div.style.backgroundPosition = 'center';
  } else {
    div.style.background = u.avatar_color;
    div.textContent = u.nickname[0].toUpperCase();
  }
  return div;
}

function createLabelHtml(label) {
  if (label === 'verified') {
    var badge = document.createElement('span');
    badge.className = 'verified-badge';
    badge.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
    return badge;
  }
  if (label === 'scam') {
    var scam = document.createElement('span');
    scam.className = 'scam-label';
    scam.textContent = 'SCAM';
    return scam;
  }
  return null;
}

const authScreen = $('auth-screen');
const appScreen = $('app-screen');
const authError = document.querySelector('.auth-error');
const onlineUsersDiv = $('online-users');
const recentUsersDiv = $('recent-users');
const searchResultsDiv = $('search-results');
const messagesContainer = $('messages-container');
const messagesList = $('messages-list');
const messageInput = $('message-input');
const sendBtn = $('send-btn');
const chatPlaceholder = $('chat-placeholder');
const chatActive = $('chat-active');
const chatArea = $('chat-area');
const sidebar = $('sidebar');
const chatBack = $('chat-back');
const chatDeleteBtn = $('chat-delete-btn');
const profileEyeBtn = $('profile-eye-btn');
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
const usernameInput = $('username-input');
const usernameBtn = $('username-btn');
const usernameError = $('username-error');
const confirmModal = $('confirm-modal');
const confirmText = $('confirm-text');
const confirmOkBtn = $('confirm-ok');
const confirmCancel = $('confirm-cancel');
const profilePanel = $('profile-panel');
const profileClose = $('profile-close');
const profileAvatar = $('profile-avatar');
const profileNickname = $('profile-nickname');
const profileUsername = $('profile-username');
const profileStatus = $('profile-status');
const typingIndicator = $('typing-indicator');
const chatUserMeta = $('chat-user-meta');
const nicknameInput = $('nickname-input');
const nicknameBtn = $('nickname-btn');
const nicknameError = $('nickname-error');
const avatarInput = $('avatar-input');
const avatarRemoveBtn = $('avatar-remove-btn');
const avatarError = $('avatar-error');
const themeOptions = document.querySelectorAll('.theme-option');
const adminBtn = $('admin-btn');
const adminPanel = $('admin-panel');
const adminClose = $('admin-close');
const adminBody = $('admin-body');

let auth, googleProvider;

try {
  if (typeof firebase === 'undefined') throw new Error('Firebase SDK not loaded');
  const firebaseConfig = {
    apiKey: "AIzaSyDi8v1i0hHUXFwkrxS2T4ZywFpKMyFIMA0",
    authDomain: "so2market.firebaseapp.com",
    projectId: "so2market",
  };
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  googleProvider = new firebase.auth.GoogleAuthProvider();
} catch (e) {
  console.error('Firebase init error:', e);
}

let isMobile = window.innerWidth <= 768;
window.addEventListener('resize', () => { isMobile = window.innerWidth <= 768; });

let confirmCallback = null;

function showConfirm(text, callback) {
  confirmText.textContent = text;
  confirmCallback = callback;
  confirmModal.style.display = 'flex';
}

function hideConfirm() {
  confirmModal.style.display = 'none';
  confirmCallback = null;
  confirmOkBtn.style.display = '';
  confirmCancel.textContent = 'Cancel';
}

function confirmOk() {
  const cb = confirmCallback;
  hideConfirm();
  if (cb) cb();
}

confirmModal.addEventListener('click', (e) => {
  if (e.target === confirmModal) hideConfirm();
});

googleBtn.addEventListener('click', () => {
  if (!auth) { authError.textContent = 'Firebase not loaded. Check internet.'; return; }
  authError.textContent = 'Signing in...';
  auth.signInWithPopup(googleProvider).then(async (result) => {
    await handleGoogleResult(result);
  }).catch((err) => {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
      authError.textContent = 'Redirecting to Google...';
      auth.signInWithRedirect(googleProvider);
    } else {
      authError.textContent = err.message || 'Sign in failed';
    }
  });
});

async function handleGoogleResult(result) {
  const user = result.user;
  const res = await fetch(API + '/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: user.uid, displayName: user.displayName, email: user.email })
  });
  const data = await res.json();
  if (res.ok) setUser(data.user);
  else authError.textContent = data.error;
}

auth.getRedirectResult().then(async (result) => {
  if (result.user) {
    await handleGoogleResult(result);
  }
}).catch((err) => {
  console.error('Redirect sign-in error:', err);
});

function setUser(user) {
  currentUser = user;
  localStorage.setItem('pulse_user', JSON.stringify(user));
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  updateUserUI();
  updateAdminBtn();
  connectSocket();
  loadAllUsers();
  loadRecentUsers();
}

function updateUserUI() {
  myAvatar.style.background = currentUser.avatar_color;
  myAvatar.textContent = currentUser.nickname[0].toUpperCase();
  myNickname.innerHTML = '';
  var myNameSpan = document.createElement('span');
  myNameSpan.textContent = currentUser.nickname;
  myNameSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  myNickname.appendChild(myNameSpan);
  var labelEl = createLabelHtml(currentUser.label);
  if (labelEl) myNickname.appendChild(labelEl);
  settingsAvatar.style.background = currentUser.avatar_color;
  settingsAvatar.textContent = currentUser.nickname[0].toUpperCase();
  settingsNickname.textContent = currentUser.nickname;
  var nv = settingsNickname.querySelector('.verified-badge, .scam-label');
  if (nv) nv.remove();
  var le2 = createLabelHtml(currentUser.label);
  if (le2) settingsNickname.appendChild(le2);
  settingsUsername.textContent = '@' + currentUser.username;
  var avUrl = currentUser.avatar_url;
  if (avUrl && avUrl.startsWith('/')) avUrl = API + avUrl;
  if (avUrl) {
    myAvatar.style.backgroundImage = 'url(' + avUrl + ')';
    myAvatar.style.backgroundSize = 'cover';
    myAvatar.textContent = '';
    settingsAvatar.style.backgroundImage = 'url(' + avUrl + ')';
    settingsAvatar.style.backgroundSize = 'cover';
    settingsAvatar.textContent = '';
  } else {
    myAvatar.style.backgroundImage = '';
    myAvatar.style.background = currentUser.avatar_color;
    myAvatar.textContent = currentUser.nickname[0].toUpperCase();
    settingsAvatar.style.backgroundImage = '';
    settingsAvatar.style.background = currentUser.avatar_color;
    settingsAvatar.textContent = currentUser.nickname[0].toUpperCase();
  }
}

function connectSocket() {
  if (socket) socket.disconnect();
  socket = io(API, { transports: ['polling', 'websocket'] });

  socket.on('connect', () => {
    socket.emit('user:online', currentUser);
  });

  socket.on('users:online', (users) => {
    onlineUsersList = users;
    renderOnlineUsers(users);
    updateOnlineStatus();
  });

  socket.on('messages:history', (messages) => {
    allMessages = messages;
    if (activeChatId) renderMessages();
    loadRecentUsers();
  });

  socket.on('message:new', (message) => {
    allMessages.push(message);
    if (allMessages.length > 200) allMessages = allMessages.slice(-200);
    if (activeChatId && message.chat_id === activeChatId) {
      renderMessages();
      scrollToBottom();
    } else if (message.receiver_id === currentUser.id) {
      if (!unreadCounts[message.sender_id]) unreadCounts[message.sender_id] = 0;
      unreadCounts[message.sender_id]++;
      loadRecentUsers();
      playNotification();
    }
    loadRecentUsers();
  });

  socket.on('message:deleted', ({ messageId }) => {
    allMessages = allMessages.filter(m => m.id !== messageId);
    if (activeChatId) renderMessages();
  });

  socket.on('chat:deleted', ({ chatId }) => {
    if (activeChatId === chatId) {
      closeChat();
    }
    loadRecentUsers();
  });

  socket.on('chats:list', () => {});

  socket.on('typing:start', ({ userId }) => {
    if (typingIndicator && userId === activeUserId) typingIndicator.style.display = 'flex';
  });

  socket.on('typing:stop', ({ userId }) => {
    if (typingIndicator && userId === activeUserId) typingIndicator.style.display = 'none';
  });

  socket.on('username:changed', ({ userId, username }) => {
    const u = allUsers.find(x => x.id === userId);
    if (u) u.username = username;
    if (activeUserObj && activeUserObj.id === userId) activeUserObj.username = username;
    const userEl = document.querySelector('#profile-username');
    if (userEl && activeUserObj && activeUserObj.id === userId) userEl.textContent = '@' + username;
  });

  socket.on('nickname:changed', ({ userId, nickname }) => {
    const u = allUsers.find(x => x.id === userId);
    if (u) u.nickname = nickname;
    if (activeUserObj && activeUserObj.id === userId) {
      activeUserObj.nickname = nickname;
      chatPartnerName.textContent = nickname;
      chatAvatar.textContent = nickname[0].toUpperCase();
    }
  });

  socket.on('avatar:changed', ({ userId, avatarUrl }) => {
    allUsers.forEach(function(u) { if (u.id === userId) u.avatar_url = avatarUrl; });
    onlineUsersList.forEach(function(ou) { if (ou.id === userId) ou.avatar_url = avatarUrl; });
    renderOnlineUsers(onlineUsersList);
    if (activeUserObj && activeUserObj.id === userId) {
      activeUserObj.avatar_url = avatarUrl;
      var avUrl = avatarUrl;
      if (avUrl && avUrl.startsWith('/')) avUrl = API + avUrl;
      if (avUrl) {
        chatAvatar.style.backgroundImage = 'url(' + avUrl + ')';
        chatAvatar.style.backgroundSize = 'cover';
        chatAvatar.textContent = '';
      } else {
        chatAvatar.style.backgroundImage = '';
        chatAvatar.style.background = activeUserObj.avatar_color;
        chatAvatar.textContent = activeUserObj.nickname[0].toUpperCase();
      }
    }
    loadAllUsers();
    loadRecentUsers();
  });

  socket.on('label:changed', ({ userId, label }) => {
    allUsers.forEach(function(u) { if (u.id === userId) u.label = label; });
    onlineUsersList.forEach(function(ou) { if (ou.id === userId) ou.label = label; });
    renderOnlineUsers(onlineUsersList);
    if (activeUserObj && activeUserObj.id === userId) {
      activeUserObj.label = label;
      var existingLabel = chatPartnerName.querySelector('.verified-badge, .scam-label');
      if (existingLabel) existingLabel.remove();
      var labelEl = createLabelHtml(label);
      if (labelEl) chatPartnerName.appendChild(labelEl);
    }
    if (currentUser && currentUser.id === userId) {
      currentUser.label = label;
      updateUserUI();
    }
    loadRecentUsers();
  });
}

function updateOnlineStatus() {
  if (activeUserId) {
    const online = onlineUsersList.some(u => u.id === activeUserId);
    chatStatus.textContent = online ? 'online' : 'offline';
    chatStatus.classList.toggle('online', online);
    const profStatus = document.getElementById('profile-status');
    if (profStatus) profStatus.textContent = online ? 'online' : 'offline';
  }
}

function closeChat() {
  activeChatId = null;
  activeUserId = null;
  activeUserObj = null;
  allMessages = [];
  chatActive.style.display = 'none';
  chatPlaceholder.style.display = 'flex';
  showSidebar();
}

function showSidebar() {
  sidebar.classList.remove('mobile-hidden');
  chatArea.style.display = '';
  chatArea.classList.remove('mobile-chat-open');
}

function showChat() {
  sidebar.classList.remove('mobile-visible');
  sidebar.classList.add('mobile-hidden');
  chatArea.style.display = 'flex';
  chatArea.classList.add('mobile-chat-open');
}

async function loadAllUsers() {
  try {
    const res = await fetch(API + '/api/users?_t=' + Date.now());
    const data = await res.json();
    allUsers = data.users.filter(u => u.id !== currentUser.id);
  } catch {}
}

async function loadRecentUsers() {
  try {
    const res = await fetch(API + '/api/users/recent?userId=' + currentUser.id + '&_t=' + Date.now());
    const data = await res.json();
    renderRecentUsers(data.users);
  } catch {}
}

function renderRecentUsers(users) {
  recentUsersDiv.innerHTML = '';
  if (!users.length) {
    recentUsersDiv.innerHTML = '<div style="color:#52525b;font-size:13px;padding:8px 10px;">No conversations</div>';
    return;
  }
  users.forEach(u => {
    const el = document.createElement('div');
    el.className = 'user-item';
    const count = unreadCounts[u.id] || 0;
    var badgeHtml = '';
    if (count > 0) badgeHtml = '<div class="unread-badge">' + (count > 99 ? '99+' : count) + '</div>';
    el.appendChild(createAvatarHtml(u));
    var nameSpan = document.createElement('span');
    nameSpan.className = 'user-name';
    nameSpan.textContent = u.nickname;
    var nameGroup = document.createElement('div');
    nameGroup.style.cssText = 'display:flex;align-items:center;gap:4px;flex:1;min-width:0;overflow:hidden';
    nameSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    nameGroup.appendChild(nameSpan);
    var labelEl = createLabelHtml(u.label);
    if (labelEl) nameGroup.appendChild(labelEl);
    el.appendChild(nameGroup);
    if (badgeHtml) el.insertAdjacentHTML('beforeend', badgeHtml);
    el.addEventListener('click', () => startChat(u));
    recentUsersDiv.appendChild(el);
  });
}

function renderOnlineUsers(onlineList) {
  onlineUsersDiv.innerHTML = '';
  const seen = new Set();
  const recentIds = new Set();
  document.querySelectorAll('#recent-users .user-item').forEach(el => {
    const name = el.querySelector('.user-name');
    if (name) recentIds.add(name.textContent);
  });
  const others = onlineList.filter(u =>
    u.id !== currentUser.id && !seen.has(u.id) && seen.add(u.id) &&
    (recentIds.has(u.nickname) || u.username === 'pulsechatbot')
  );
  if (!others.length) {
    const botInList = onlineList.some(u => u.username === 'pulsechatbot' && u.id !== currentUser.id);
    if (botInList) return;
    onlineUsersDiv.innerHTML = '<div style="color:#52525b;font-size:13px;padding:8px 10px;">No one online</div>';
    return;
  }
  others.forEach(u => {
    const el = document.createElement('div');
    el.className = 'user-item';
    el.appendChild(createAvatarHtml(u));
    var nameSpan = document.createElement('span');
    nameSpan.className = 'user-name';
    nameSpan.textContent = u.nickname;
    var nameGroup = document.createElement('div');
    nameGroup.style.cssText = 'display:flex;align-items:center;gap:4px;flex:1;min-width:0;overflow:hidden';
    nameSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    nameGroup.appendChild(nameSpan);
    var labelEl = createLabelHtml(u.label);
    if (labelEl) nameGroup.appendChild(labelEl);
    el.appendChild(nameGroup);
    var dot = document.createElement('div');
    dot.className = 'online-dot';
    el.appendChild(dot);
    el.addEventListener('click', () => startChat(u));
    onlineUsersDiv.appendChild(el);
  });
}

let searchTimeout;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const q = searchInput.value.trim().replace('@', '');
  if (!q) { searchResultsDiv.classList.add('hidden'); return; }
  searchTimeout = setTimeout(() => {
    const matches = allUsers.filter(u => u.username.toLowerCase().includes(q.toLowerCase()) || u.nickname.toLowerCase().includes(q.toLowerCase()));
    if (!matches.length) {
      searchResultsDiv.innerHTML = '<div style="color:#52525b;font-size:13px;padding:10px 12px;">Not found</div>';
    } else {
      searchResultsDiv.innerHTML = '';
      matches.slice(0, 10).forEach(u => {
        const el = document.createElement('div');
        el.className = 'user-item';
        el.appendChild(createAvatarHtml(u));
        var nameSpan = document.createElement('span');
        nameSpan.className = 'user-name';
        nameSpan.textContent = u.nickname;
        var nameGroup = document.createElement('div');
        nameGroup.style.cssText = 'display:flex;align-items:center;gap:4px;flex:1;min-width:0;overflow:hidden';
        nameSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        nameGroup.appendChild(nameSpan);
        var labelEl = createLabelHtml(u.label);
        if (labelEl) nameGroup.appendChild(labelEl);
        el.appendChild(nameGroup);
        el.addEventListener('click', () => { searchResultsDiv.classList.add('hidden'); searchInput.value = ''; startChat(u); });
        searchResultsDiv.appendChild(el);
      });
    }
    searchResultsDiv.classList.remove('hidden');
  }, 200);
});

searchInput.addEventListener('blur', () => setTimeout(() => searchResultsDiv.classList.add('hidden'), 200));
searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) searchInput.dispatchEvent(new Event('input')); });

chatBack.addEventListener('click', () => {
  showSidebar();
});

function openProfile() {
  var user = activeUserObj;
  if (!user) return;
  profileAvatar.style.background = user.avatar_color;
  profileAvatar.textContent = user.nickname[0].toUpperCase();
  var avUrl = user.avatar_url;
  if (avUrl && avUrl.startsWith('/')) avUrl = API + avUrl;
  if (avUrl) {
    profileAvatar.style.backgroundImage = 'url(' + avUrl + ')';
    profileAvatar.style.backgroundSize = 'cover';
    profileAvatar.textContent = '';
  } else {
    profileAvatar.style.backgroundImage = '';
    profileAvatar.style.background = user.avatar_color;
    profileAvatar.textContent = user.nickname[0].toUpperCase();
  }
  profileNickname.textContent = user.nickname;
  profileUsername.textContent = '@' + user.username;
  var existingLabel = profileNickname.querySelector('.verified-badge, .scam-label');
  if (existingLabel) existingLabel.remove();
  var labelEl = createLabelHtml(user.label);
  if (labelEl) profileNickname.appendChild(labelEl);
  profileStatus.textContent = onlineUsersList.some(function(u) { return u.id === user.id; }) ? 'online' : 'offline';
  profilePanel.style.display = 'flex';
  profilePanel.style.setProperty('display', 'flex', 'important');
}

profileClose.onclick = function() { profilePanel.style.display = 'none'; };
profilePanel.onclick = function(e) { if (e.target === profilePanel) profilePanel.style.display = 'none'; };

chatUserMeta.addEventListener('click', openProfile);
chatAvatar.addEventListener('click', openProfile);
profileEyeBtn.addEventListener('click', openProfile);

let typingTimer = null;
function emitTypingStart() {
  if (!activeUserId || !socket || !socket.connected) return;
  socket.emit('typing:start', { userId: currentUser.id, chatId: activeChatId });
}
function emitTypingStop() {
  clearTimeout(typingTimer);
  if (socket && socket.connected) socket.emit('typing:stop', { userId: currentUser.id });
}
messageInput.addEventListener('input', () => {
  emitTypingStart();
  clearTimeout(typingTimer);
  typingTimer = setTimeout(emitTypingStop, 1500);
});
messageInput.addEventListener('keydown', () => {
  emitTypingStart();
  clearTimeout(typingTimer);
  typingTimer = setTimeout(emitTypingStop, 1500);
});
messageInput.addEventListener('blur', emitTypingStop);

settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.remove('hidden');
  usernameInput.value = '';
  usernameError.textContent = '';
});

settingsClose.addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
  usernameError.textContent = '';
});

settingsPanel.addEventListener('click', (e) => {
  if (e.target === settingsPanel) { settingsPanel.classList.add('hidden'); usernameError.textContent = ''; }
});

usernameBtn.addEventListener('click', async () => {
  const n = usernameInput.value.trim().replace('@', '');
  if (!n) return;
  usernameError.textContent = '';
  try {
    const res = await fetch(API + '/api/users/username', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, username: n })
    });
    const data = await res.json();
    if (res.ok) {
      currentUser.username = data.username;
      localStorage.setItem('pulse_user', JSON.stringify(currentUser));
      updateUserUI();
      usernameInput.value = '';
      usernameError.textContent = 'Saved!';
      usernameError.style.color = '#22c55e';
      setTimeout(() => { usernameError.textContent = ''; usernameError.style.color = '#ef4444'; }, 2000);
    } else usernameError.textContent = data.error;
  } catch { usernameError.textContent = 'Connection error'; }
});

usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') usernameBtn.click(); });

nicknameBtn.addEventListener('click', async () => {
  const n = nicknameInput.value.trim();
  if (!n || n.length > 30) { nicknameError.textContent = '1-30 chars'; return; }
  nicknameError.textContent = '';
  try {
    const res = await fetch(API + '/api/users/nickname', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, nickname: n })
    });
    const data = await res.json();
    if (res.ok) {
      currentUser.nickname = data.nickname;
      localStorage.setItem('pulse_user', JSON.stringify(currentUser));
      updateUserUI();
      nicknameInput.value = '';
      nicknameError.textContent = 'Saved!';
      nicknameError.style.color = '#22c55e';
      setTimeout(() => { nicknameError.textContent = ''; nicknameError.style.color = '#ef4444'; }, 2000);
    } else nicknameError.textContent = data.error;
  } catch { nicknameError.textContent = 'Connection error'; }
});

nicknameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nicknameBtn.click(); });

avatarInput.addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  if (file.size > 500 * 1024) { avatarError.textContent = 'Max 500KB'; return; }
  avatarError.textContent = '';
  const reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var max = 200;
      var w = img.width, h = img.height;
      if (w > max || h > max) {
        var r = Math.min(max / w, max / h);
        w = Math.round(w * r); h = Math.round(h * r);
      }
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      var dataUrl = c.toDataURL('image/jpeg', 0.8);
      uploadAvatar(dataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

function uploadAvatar(dataUrl) {
  fetch(API + '/api/users/avatar', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id, avatarUrl: dataUrl })
  }).then(function(res) {
    if (res.ok) {
      return res.json().then(function(data) {
        currentUser.avatar_url = data.avatarUrl;
        localStorage.setItem('pulse_user', JSON.stringify(currentUser));
        updateUserUI();
        avatarError.textContent = 'Saved!';
        avatarError.style.color = '#22c55e';
        setTimeout(function() { avatarError.textContent = ''; avatarError.style.color = '#ef4444'; }, 2000);
      });
    } else avatarError.textContent = 'Save failed';
  }).catch(function() { avatarError.textContent = 'Connection error'; });
}

avatarRemoveBtn.addEventListener('click', async () => {
  try {
    const res = await fetch(API + '/api/users/avatar', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, avatarUrl: '' })
    });
    if (res.ok) {
      const data = await res.json();
      currentUser.avatar_url = data.avatarUrl;
      localStorage.setItem('pulse_user', JSON.stringify(currentUser));
      updateUserUI();
      avatarError.textContent = 'Avatar removed';
      avatarError.style.color = '#22c55e';
      setTimeout(() => { avatarError.textContent = ''; avatarError.style.color = '#ef4444'; }, 2000);
    }
  } catch { avatarError.textContent = 'Connection error'; }
});

themeOptions.forEach(function(btn) {
  btn.addEventListener('click', function() {
    themeOptions.forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    var theme = btn.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pulse_theme', theme);
  });
});

var savedTheme = localStorage.getItem('pulse_theme');
if (savedTheme) {
  document.documentElement.setAttribute('data-theme', savedTheme);
  themeOptions.forEach(function(btn) {
    if (btn.getAttribute('data-theme') === savedTheme) btn.classList.add('active');
  });
}

var ADMIN_USERNAMES = ['teardown777', 'pulse'];

function updateAdminBtn() {
  if (!adminBtn) return;
  if (currentUser && currentUser.username && ADMIN_USERNAMES.indexOf(currentUser.username.toLowerCase()) !== -1) {
    adminBtn.classList.remove('hidden');
  } else {
    adminBtn.classList.add('hidden');
  }
}

setTimeout(function retryAdmin() {
  if (adminBtn && currentUser && currentUser.username && ADMIN_USERNAMES.indexOf(currentUser.username.toLowerCase()) !== -1) {
    adminBtn.classList.remove('hidden');
  }
}, 3000);

adminBtn.addEventListener('click', function() {
  settingsPanel.classList.add('hidden');
  openAdminPanel();
});

adminClose.addEventListener('click', function() { adminPanel.style.display = 'none'; });
adminPanel.addEventListener('click', function(e) { if (e.target === adminPanel) adminPanel.style.display = 'none'; });

function openAdminPanel() {
  adminBody.innerHTML = '<div style="color:#52525b;text-align:center;padding:20px;">Loading...</div>';
  adminPanel.style.display = 'flex';
  fetch(API + '/api/admin/users?adminId=' + currentUser.id)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var allAdminUsers = data.users;
      adminBody.innerHTML = '';
      var adminSearchInput = $('admin-search-input');
      adminSearchInput.value = '';
      function renderAdminUsers(filter) {
        adminBody.innerHTML = '';
        var q = filter.toLowerCase();
        var matches = allAdminUsers.filter(function(u) { return u.username.toLowerCase().indexOf(q) !== -1 || u.nickname.toLowerCase().indexOf(q) !== -1; });
        if (!matches.length) {
          adminBody.innerHTML = '<div style="color:#52525b;text-align:center;padding:20px;">Not found</div>';
          return;
        }
        matches.forEach(function(u) {
          var row = document.createElement('div');
          row.className = 'admin-user-item';
          var info = document.createElement('div');
          info.className = 'admin-user-info';
          var nameRow = document.createElement('div');
          nameRow.className = 'admin-user-name';
          nameRow.textContent = u.nickname;
          var labelEl = createLabelHtml(u.label);
          if (labelEl) nameRow.appendChild(labelEl);
          info.appendChild(nameRow);
          var emailRow = document.createElement('div');
          emailRow.className = 'admin-user-email';
          emailRow.textContent = '@' + u.username + (u.email ? ' — ' + u.email : '');
          info.appendChild(emailRow);
          row.appendChild(info);
          ['verified', 'scam'].forEach(function(lbl) {
            var btn = document.createElement('button');
            btn.className = 'admin-label-btn' + (u.label === lbl ? ' active-' + lbl : '');
            btn.textContent = lbl === 'verified' ? 'Verified' : 'SCAM';
            btn.addEventListener('click', function() {
              var newLabel = u.label === lbl ? '' : lbl;
              fetch(API + '/api/admin/users/' + u.id + '/label?adminId=' + currentUser.id, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: newLabel })
              }).then(function(r) { return r.json(); }).then(function() {
                u.label = newLabel;
                renderAdminUsers(adminSearchInput.value);
              }).catch(function() {});
            });
            row.appendChild(btn);
          });
          adminBody.appendChild(row);
        });
      }
      renderAdminUsers('');
      adminSearchInput.oninput = function() { renderAdminUsers(adminSearchInput.value); };
    }).catch(function() { adminBody.innerHTML = '<div style="color:#ef4444;text-align:center;padding:20px;">Failed to load</div>'; });
}

function startChat(user) {
  activeUserId = user.id;
  activeUserObj = user;
  chatPlaceholder.style.display = 'none';
  chatActive.style.display = 'flex';
  chatPartnerName.innerHTML = '';
  var nameSpan = document.createElement('span');
  nameSpan.textContent = user.nickname;
  nameSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  chatPartnerName.appendChild(nameSpan);
  var labelEl = createLabelHtml(user.label);
  if (labelEl) chatPartnerName.appendChild(labelEl);
  chatAvatar.style.background = user.avatar_color;
  chatAvatar.textContent = user.nickname[0].toUpperCase();
  var avUrl = user.avatar_url;
  if (avUrl && avUrl.startsWith('/')) avUrl = API + avUrl;
  if (avUrl) {
    chatAvatar.style.backgroundImage = 'url(' + avUrl + ')';
    chatAvatar.style.backgroundSize = 'cover';
    chatAvatar.textContent = '';
  } else {
    chatAvatar.style.backgroundImage = '';
    chatAvatar.style.background = user.avatar_color;
    chatAvatar.textContent = user.nickname[0].toUpperCase();
  }
  if (typingIndicator) typingIndicator.style.display = 'none';
  unreadCounts[user.id] = 0;
  updateOnlineStatus();
  messageInput.focus();
  showChat();

  if (socket && socket.connected) {
    socket.emit('private:start', { userId: user.id }, ({ chatId }) => {
      activeChatId = chatId;
      renderMessages();
      scrollToBottom();
    });
  }

  chatDeleteBtn.onclick = () => {
    if (!activeChatId) return;
    showConfirm('Delete this chat for both users?', () => {
      fetch(API + '/api/chats/' + activeChatId + '?userId=' + currentUser.id, { method: 'DELETE' })
        .catch(() => {});
    });
  };
}

function renderMessages() {
  const msgs = allMessages.filter(m => m.chat_id === activeChatId);
  messagesContainer.innerHTML = '';
  if (!msgs.length) {
    messagesContainer.innerHTML = '<div class="system-message">No messages yet</div>';
    return;
  }
  msgs.slice(-50).forEach(m => {
    const isOwn = m.sender_id === currentUser.id;
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : 'other'}`;
    const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
      ${!isOwn ? `<div class="msg-sender">${m.sender_name}</div>` : ''}
      ${m.content}
      <div class="msg-time">${time}</div>
      ${isOwn ? `<button class="msg-delete" data-id="${m.id}">✕</button>` : ''}
    `;
    const delBtn = div.querySelector('.msg-delete');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showConfirm('Delete this message?', () => {
          fetch(API + '/api/messages/' + m.id + '?userId=' + currentUser.id, { method: 'DELETE' })
            .then(res => {
              if (!res.ok) console.error('Delete failed:', res.status);
              else {
                allMessages = allMessages.filter(msg => msg.id !== m.id);
                if (activeChatId) renderMessages();
              }
            })
            .catch(err => console.error('Delete error:', err));
        });
      });
    }
    messagesContainer.appendChild(div);
  });
}

function scrollToBottom() {
  requestAnimationFrame(() => { messagesContainer.scrollTop = messagesContainer.scrollHeight; });
}

function playNotification() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || !activeChatId || !socket || !socket.connected) return;
  socket.emit('message:send', { chatId: activeChatId, content, receiverId: activeUserId });
  messageInput.value = '';
  emitTypingStop();
}

settingsLogout.addEventListener('click', () => {
  localStorage.removeItem('pulse_user');
  auth.signOut();
  if (socket) socket.disconnect();
  currentUser = null; activeChatId = null; activeUserId = null; allMessages = [];
  settingsPanel.classList.add('hidden');
  appScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
  authError.textContent = '';
});

const saved = localStorage.getItem('pulse_user');
if (saved) {
  try {
    const u = JSON.parse(saved);
    if (u.id && u.nickname && u.avatar_color) setUser(u);
  } catch {}
}
