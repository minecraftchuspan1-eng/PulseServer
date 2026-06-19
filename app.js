let socket;
let currentUser = null;
let activeChatId = null;
let activeUserId = null;
let activeUserObj = null;
let allMessages = [];
let allUsers = [];
let onlineUsersList = [];
let unreadCounts = {};
let pendingPhoto = null;
let myChats = [];
let activeChatObj = null;

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

const photoUploadBtn = $('photo-upload-btn');
const photoUploadFile = $('photo-upload-file');
const photoPendingBar = $('photo-pending-bar');
const photoPendingCancel = $('photo-pending-cancel');

const chatsListDiv = $('chats-list');
const createChatBtn = $('create-chat-btn');
const createChatModal = $('create-chat-modal');
const createChatClose = $('create-chat-close');
const createChatName = $('create-chat-name');
const createChatUsername = $('create-chat-username');
const createChatUsernameStatus = $('create-chat-username-status');
const createChatDesc = $('create-chat-desc');
const createChatError = $('create-chat-error');
const createChatSubmit = $('create-chat-submit');
const createTypeGroup = $('create-type-group');
const createTypeChannel = $('create-type-channel');
const membersModal = $('members-modal');
const membersClose = $('members-close');
const membersBody = $('members-body');
let createType = 'group';
let activeChatMembers = [];
const chatAvatarInput = document.createElement('input');
chatAvatarInput.type = 'file';
chatAvatarInput.accept = 'image/*';
chatAvatarInput.style.display = 'none';
document.body.appendChild(chatAvatarInput);

photoUploadBtn.addEventListener('click', () => {
  if (!activeChatId) { alert('Select a chat first'); return; }
  photoUploadFile.click();
});

photoUploadFile.addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    alert('Max 5MB');
    this.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    pendingPhoto = e.target.result;
    photoPendingBar.style.display = 'flex';
    messageInput.placeholder = 'Add caption (optional)...';
    messageInput.focus();
  };
  reader.readAsDataURL(file);
  this.value = '';
});

photoPendingCancel.addEventListener('click', function() {
  pendingPhoto = null;
  photoPendingBar.style.display = 'none';
  messageInput.placeholder = 'Type a message...';
});

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

function showAgreement(callback) {
  var existing = document.getElementById('agreement-modal');
  if (existing) existing.remove();
  var modal = document.createElement('div');
  modal.id = 'agreement-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:20px';
  var backdrop = document.createElement('div');
  backdrop.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.5)';
  modal.appendChild(backdrop);
  var box = document.createElement('div');
  box.style.cssText = 'position:relative;background:var(--bg-tertiary);border-radius:16px;padding:28px;max-width:400px;width:100%;border:1px solid var(--border-color);box-shadow:0 25px 50px var(--shadow)';
  var title = document.createElement('h3');
  title.style.cssText = 'font-size:18px;font-weight:700;margin:0 0 12px;text-align:center';
  title.textContent = 'User Agreement';
  box.appendChild(title);
  var text = document.createElement('p');
  text.style.cssText = 'font-size:13px;color:var(--text-secondary);line-height:1.6;margin:0 0 20px';
  text.innerHTML = 'By signing in, you agree to follow Pulse rules. Do not spam, harass others, or share illegal content. Your data is handled according to our Privacy Policy.';
  box.appendChild(text);
  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end';
  var cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'padding:10px 18px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);border-radius:10px;font-weight:600;cursor:pointer;font-size:14px';
  cancelBtn.onclick = function() { modal.remove(); };
  btnRow.appendChild(cancelBtn);
  var agreeBtn = document.createElement('button');
  agreeBtn.textContent = 'Agree & Sign In';
  agreeBtn.style.cssText = 'padding:10px 18px;border:none;background:linear-gradient(135deg,#6366f1,#a855f7);color:white;border-radius:10px;font-weight:700;cursor:pointer;font-size:14px';
  agreeBtn.onclick = function() { modal.remove(); if (callback) callback(); };
  btnRow.appendChild(agreeBtn);
  box.appendChild(btnRow);
  modal.appendChild(box);
  document.body.appendChild(modal);
}

googleBtn.addEventListener('click', () => {
  if (!auth) { authError.textContent = 'Firebase not loaded. Check internet.'; return; }
  showAgreement(function() {
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
    if (currentUser) {
      var me = users.find(function(u) { return u.id === currentUser.id; });
      if (me) {
        currentUser.label = me.label || '';
        localStorage.setItem('pulse_user', JSON.stringify(currentUser));
        updateUserUI();
      }
    }
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
    myChats = myChats.filter(function(c) { return c.id !== chatId; });
    renderChats();
    if (activeChatId === chatId) {
      closeChat();
    }
    loadRecentUsers();
  });

  socket.on('chats:list', (chats) => {
    myChats = chats || [];
    renderChats();
  });

  socket.on('chat:created', (chat) => {
    if (Number(chat.owner_id) !== Number(currentUser.id)) return;
    var exists = myChats.some(function(c) { return c.id === chat.id; });
    if (!exists) {
      myChats.push(chat);
      renderChats();
    }
  });

  socket.on('chat:member:joined', ({ chatId, userId, members }) => {
    if (activeChatId === chatId) { activeChatMembers = members || []; updateInputVisibility(); }
    if (userId === currentUser.id) {
      fetch(API + '/api/chats/search?q=&userId=' + currentUser.id + '&_t=' + Date.now()).catch(function(){});
    }
    renderMembersModal();
    updateChatHeader();
  });

  socket.on('chat:member:left', ({ chatId, userId }) => {
    if (userId === currentUser.id) {
      myChats = myChats.filter(function(c) { return Number(c.id) !== Number(chatId); });
      renderChats();
      if (Number(activeChatId) === Number(chatId)) closeChat();
    }
    if (Number(activeChatId) === Number(chatId)) {
      loadMembers(chatId);
    }
  });

  socket.on('chat:member:banned', ({ chatId, targetId, members }) => {
    if (Number(activeChatId) === Number(chatId)) { activeChatMembers = members || []; updateInputVisibility(); }
    renderMembersModal();
    if (targetId === currentUser.id) {
      myChats = myChats.filter(function(c) { return Number(c.id) !== Number(chatId); });
      renderChats();
      if (Number(activeChatId) === Number(chatId)) closeChat();
    }
  });

  socket.on('chat:member:unbanned', () => {});

  socket.on('chat:label:changed', ({ chatId, label }) => {
    var chat = myChats.find(function(c) { return Number(c.id) === Number(chatId); });
    if (chat) chat.label = label;
    if (activeChatObj && Number(activeChatObj.id) === Number(chatId)) {
      activeChatObj.label = label;
    }
    renderChats();
  });

  socket.on('chat:avatar:changed', ({ chatId, avatarUrl }) => {
    var chat = myChats.find(function(c) { return Number(c.id) === Number(chatId); });
    if (chat) chat.avatar_url = avatarUrl;
    if (activeChatObj && Number(activeChatObj.id) === Number(chatId)) {
      activeChatObj.avatar_url = avatarUrl;
      var url = resolveAvatarUrl(avatarUrl);
      if (url) {
        chatAvatar.style.backgroundImage = 'url(' + url + ')';
        chatAvatar.style.backgroundSize = 'cover';
        chatAvatar.style.background = 'transparent';
        chatAvatar.innerHTML = '';
      } else {
        chatAvatar.style.backgroundImage = 'none';
        chatAvatar.style.background = activeChatObj.type === 'channel' ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#10b981,#059669)';
        if (activeChatObj.type === 'channel') {
          chatAvatar.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 8 14 13 2 18 6 17 11 21 18 13 22 12 18 11 11 5"/></svg>';
        } else {
          chatAvatar.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
        }
      }
    }
    renderChats();
  });

  socket.on('chat:member:role', ({ chatId, targetId, role, members }) => {
    if (Number(activeChatId) === Number(chatId)) { activeChatMembers = members || []; updateInputVisibility(); }
    renderMembersModal();
  });

  socket.on('error', function(msg) {
    if (msg) alert(msg);
  });

  socket.on('typing:start', ({ userId }) => {
    if (typingIndicator && userId === activeUserId) typingIndicator.style.display = 'flex';
  });

  socket.on('typing:stop', ({ userId }) => {
    if (typingIndicator && userId === activeUserId) typingIndicator.style.display = 'none';
  });

  socket.on('photo:send', ({ message }) => {
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
      localStorage.setItem('pulse_user', JSON.stringify(currentUser));
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
  activeChatObj = null;
  activeChatMembers = [];
  allMessages = [];
  chatActive.style.display = 'none';
  chatPlaceholder.style.display = 'flex';
  showSidebar();
  pendingPhoto = null;
  photoPendingBar.style.display = 'none';
  messageInput.placeholder = 'Type a message...';
  showInputArea();
  renderChats();
  profileEyeBtn.style.display = '';
  profileEyeBtn.title = 'View profile';
  profileEyeBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
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

function resolveAvatarUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  if (url.startsWith('/')) return API + url;
  return url;
}

function renderChats() {
  chatsListDiv.innerHTML = '';
  var groupsAndChannels = myChats.filter(function(c) { return c.type === 'group' || c.type === 'channel'; });
  if (!groupsAndChannels.length) {
    chatsListDiv.innerHTML = '<div class="no-chats">No groups or channels</div>';
    return;
  }
  groupsAndChannels.forEach(function(chat) {
    var el = document.createElement('div');
    el.className = 'chat-item' + (Number(activeChatId) === Number(chat.id) ? ' active' : '');
    var icon = document.createElement('div');
    icon.className = 'chat-item-icon ' + (chat.type === 'channel' ? 'channel-icon' : 'group-icon');
    var cavUrl = resolveAvatarUrl(chat.avatar_url);
    if (cavUrl) {
      icon.style.backgroundImage = 'url(' + cavUrl + ')';
      icon.style.backgroundSize = 'cover';
      icon.style.backgroundPosition = 'center';
      icon.style.background = 'transparent';
      icon.innerHTML = '';
    } else if (chat.type === 'channel') {
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 8 14 13 2 18 6 17 11 21 18 13 22 12 18 11 11 5"/></svg>';
    } else {
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
    }
    el.appendChild(icon);
    var info = document.createElement('div');
    info.className = 'chat-item-info';
    var nameRow = document.createElement('div');
    nameRow.style.cssText = 'display:flex;align-items:center;gap:4px';
    var nameEl = document.createElement('div');
    nameEl.className = 'chat-item-name';
    nameEl.textContent = chat.name || (chat.type === 'channel' ? 'Channel' : 'Group');
    nameRow.appendChild(nameEl);
    if (chat.label) {
      var labelEl = createLabelHtml(chat.label);
      if (labelEl) nameRow.appendChild(labelEl);
    }
    info.appendChild(nameRow);
    var meta = document.createElement('div');
    meta.className = 'chat-item-meta';
    meta.textContent = chat.username ? '@' + chat.username : (chat.type === 'channel' ? 'Channel' : 'Group');
    info.appendChild(meta);
    el.appendChild(info);
    el.addEventListener('click', function() { openGroupChat(chat); });
    chatsListDiv.appendChild(el);
  });
}

function loadMembers(chatId) {
  fetch(API + '/api/chats/' + chatId + '/members?userId=' + currentUser.id + '&_t=' + Date.now())
    .then(function(r) { return r.json(); })
    .then(function(data) {
      activeChatMembers = data.members || [];
      updateChatHeader();
      updateInputVisibility();
      if (membersModal.style.display === 'flex') renderMembersModalBody();
    })
    .catch(function() {});
}

function renderMembersModal() {
  if (activeChatMembers && activeChatMembers.length) {
    renderMembersModalBody();
  } else {
    membersBody.innerHTML = '<div style="color:#52525b;text-align:center;padding:20px;">Loading...</div>';
    loadMembers(activeChatId);
  }
}

function renderMembersModalBody() {
  membersBody.innerHTML = '';
  if (!activeChatMembers || !activeChatMembers.length) {
    membersBody.innerHTML = '<div style="color:#52525b;text-align:center;padding:20px;">No members</div>';
    return;
  }
  var myRole = 'member';
  activeChatMembers.forEach(function(m) {
    if (Number(m.id) === Number(currentUser.id)) myRole = m.role;
  });
  var avatarRow = document.createElement('div');
  avatarRow.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 8px;border-bottom:1px solid var(--border-color);margin-bottom:8px';
  var chatAv = document.createElement('div');
  chatAv.className = 'member-avatar';
  var cavUrl = resolveAvatarUrl(activeChatObj.avatar_url);
  if (cavUrl) {
    chatAv.style.backgroundImage = 'url(' + cavUrl + ')';
    chatAv.style.backgroundSize = 'cover';
  } else {
    chatAv.style.background = activeChatObj.type === 'channel' ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#10b981,#059669)';
    if (activeChatObj.type === 'channel') {
      chatAv.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 8 14 13 2 18 6 17 11 21 18 13 22 12 18 11 11 5"/></svg>';
    } else {
      chatAv.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
    }
  }
  avatarRow.appendChild(chatAv);
  var infoCol = document.createElement('div');
  infoCol.style.cssText = 'flex:1';
  var nameRow = document.createElement('div');
  nameRow.style.cssText = 'font-size:14px;font-weight:600';
  nameRow.textContent = activeChatObj.name || (activeChatObj.type === 'channel' ? 'Channel' : 'Group');
  infoCol.appendChild(nameRow);
  if (activeChatObj.username) {
    var unameRow = document.createElement('div');
    unameRow.style.cssText = 'font-size:12px;color:var(--text-muted)';
    unameRow.textContent = '@' + activeChatObj.username;
    infoCol.appendChild(unameRow);
  }
  avatarRow.appendChild(infoCol);
  if (myRole === 'owner' || myRole === 'admin') {
    var changeBtn = document.createElement('button');
    changeBtn.className = 'member-action-btn';
    changeBtn.textContent = 'Change photo';
    changeBtn.addEventListener('click', function() { chatAvatarInput.click(); });
    avatarRow.appendChild(changeBtn);
  }
  membersBody.appendChild(avatarRow);
  activeChatMembers.forEach(function(m) {
    var item = document.createElement('div');
    item.className = 'member-item';
    var av = document.createElement('div');
    av.className = 'member-avatar';
    var avUrl = m.avatar_url;
    if (avUrl && avUrl.startsWith('/')) avUrl = API + avUrl;
    if (avUrl) {
      av.style.backgroundImage = 'url(' + avUrl + ')';
      av.style.backgroundSize = 'cover';
    } else {
      av.style.background = m.avatar_color;
      av.textContent = m.nickname[0].toUpperCase();
    }
    item.appendChild(av);
    var info = document.createElement('div');
    info.className = 'member-info';
    var nameEl = document.createElement('div');
    nameEl.className = 'member-name';
    nameEl.textContent = m.nickname;
    if (m.label === 'verified') {
      var badge = document.createElement('span');
      badge.className = 'verified-badge';
      badge.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
      nameEl.appendChild(badge);
    }
    if (m.label === 'scam') {
      var s = document.createElement('span');
      s.className = 'scam-label';
      s.textContent = 'SCAM';
      nameEl.appendChild(s);
    }
    info.appendChild(nameEl);
    var usernameRow = document.createElement('div');
    usernameRow.style.cssText = 'font-size:11px;color:var(--text-muted)';
    usernameRow.textContent = '@' + m.username;
    info.appendChild(usernameRow);
    var roleEl = document.createElement('div');
    roleEl.className = 'member-role' + (m.role === 'owner' ? ' owner' : m.role === 'admin' ? ' admin' : '');
    roleEl.textContent = m.role;
    info.appendChild(roleEl);
    item.appendChild(info);
    if ((myRole === 'owner' || myRole === 'admin') && m.role !== 'owner' && Number(m.id) !== Number(currentUser.id)) {
      var actions = document.createElement('div');
      actions.className = 'member-actions';
      if (myRole === 'owner') {
        if (m.role === 'admin') {
          var demoteBtn = document.createElement('button');
          demoteBtn.className = 'member-action-btn';
          demoteBtn.textContent = 'Demote';
          demoteBtn.addEventListener('click', function() {
            fetch(API + '/api/chats/' + activeChatId + '/role', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ requesterId: currentUser.id, targetId: m.id, role: 'member' })
            }).catch(function(){});
          });
          actions.appendChild(demoteBtn);
        }
        if (m.role === 'member') {
          var promoteBtn = document.createElement('button');
          promoteBtn.className = 'member-action-btn';
          promoteBtn.textContent = 'Admin';
          promoteBtn.addEventListener('click', function() {
            fetch(API + '/api/chats/' + activeChatId + '/role', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ requesterId: currentUser.id, targetId: m.id, role: 'admin' })
            }).catch(function(){});
          });
          actions.appendChild(promoteBtn);
        }
      }
      var banBtn = document.createElement('button');
      banBtn.className = 'member-action-btn danger';
      banBtn.textContent = 'Ban';
      banBtn.addEventListener('click', function() {
        showConfirm('Ban ' + m.nickname + ' from this chat?', function() {
          fetch(API + '/api/chats/' + activeChatId + '/ban', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requesterId: currentUser.id, targetId: m.id })
          }).catch(function(){});
        });
      });
      actions.appendChild(banBtn);
      item.appendChild(actions);
    }
    membersBody.appendChild(item);
  });
}

function openGroupChat(chat) {
  activeChatObj = chat;
  activeChatId = chat.id;
  activeUserId = null;
  activeUserObj = null;
  chatPlaceholder.style.display = 'none';
  chatActive.style.display = 'flex';
  chatPartnerName.innerHTML = '';
  var nameSpan = document.createElement('span');
  nameSpan.textContent = chat.name || (chat.type === 'channel' ? 'Channel' : 'Group');
  nameSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  chatPartnerName.appendChild(nameSpan);
  if (chat.label) {
    var labelEl = createLabelHtml(chat.label);
    if (labelEl) chatPartnerName.appendChild(labelEl);
  }
  if (chat.username) {
    var metaSpan = document.createElement('span');
    metaSpan.style.cssText = 'font-size:11px;color:var(--text-muted);margin-left:6px';
    metaSpan.textContent = '@' + chat.username;
    chatPartnerName.appendChild(metaSpan);
  }
  var avUrl = resolveAvatarUrl(chat.avatar_url);
  if (avUrl) {
    chatAvatar.style.backgroundImage = 'url(' + avUrl + ')';
    chatAvatar.style.backgroundSize = 'cover';
    chatAvatar.style.background = 'transparent';
    chatAvatar.innerHTML = '';
  } else {
    chatAvatar.style.background = chat.type === 'channel' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #10b981, #059669)';
    chatAvatar.style.backgroundImage = 'none';
    if (chat.type === 'channel') {
      chatAvatar.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 8 14 13 2 18 6 17 11 21 18 13 22 12 18 11 11 5"/></svg>';
    } else {
      chatAvatar.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
    }
  }
  chatAvatar.textContent = '';
  chatStatus.textContent = '';
  if (typingIndicator) typingIndicator.style.display = 'none';
  if (socket && socket.connected) {
    renderMessages();
    scrollToBottom();
    loadMembers(chat.id);
  }
  showChat();
  loadMembers(chat.id);
  var isOwner = Number(chat.owner_id) === Number(currentUser.id);
  if (isOwner) {
    chatDeleteBtn.style.display = '';
    chatDeleteBtn.title = 'Delete chat';
    chatDeleteBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    chatDeleteBtn.onclick = function() {
      showConfirm('Delete ' + (chat.name || 'this chat') + '?', function() {
        fetch(API + '/api/chats/' + activeChatId + '?userId=' + currentUser.id, { method: 'DELETE' }).catch(function(){});
      });
    };
  } else {
    chatDeleteBtn.style.display = '';
    chatDeleteBtn.title = 'Leave chat';
    chatDeleteBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
    chatDeleteBtn.onclick = function() {
      showConfirm('Leave ' + (chat.name || 'this chat') + '?', function() {
        fetch(API + '/api/chats/' + activeChatId + '/leave', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id })
        }).then(function(r) { return r.json(); }).then(function(data) {
          if (data.error) { alert(data.error); return; }
        }).catch(function(){});
      });
    };
  }
  profileEyeBtn.title = 'Members';
  profileEyeBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  profileEyeBtn.style.display = '';
  updateInputVisibility();
  renderChats();
}

function updateInputVisibility() {
  if (!activeChatObj) return;
  var isChannel = activeChatObj.type === 'channel';
  if (!isChannel) { showInputArea(); return; }
  var myRole = 'member';
  activeChatMembers.forEach(function(m) {
    if (Number(m.id) === Number(currentUser.id)) myRole = m.role;
  });
  if (myRole === 'owner' || myRole === 'admin') {
    showInputArea();
  } else {
    hideInputArea();
  }
}

function showInputArea() {
  var area = document.querySelector('.message-input-area');
  if (area) area.style.display = '';
  var typing = document.getElementById('typing-indicator');
  if (typing) typing.style.display = 'none';
}

function hideInputArea() {
  var area = document.querySelector('.message-input-area');
  if (area) area.style.display = 'none';
  var typing = document.getElementById('typing-indicator');
  if (typing) typing.style.display = 'none';
}

function openMembersModal() {
  if (!activeChatObj || !activeChatId) return;
  loadMembers(activeChatId);
  membersModal.style.display = 'flex';
}

function updateChatHeader() {
  if (activeChatObj && activeChatId) {
    var memberCount = activeChatMembers ? activeChatMembers.length : 0;
    chatStatus.textContent = memberCount + ' members';
  }
}

function openProfileOrMembers() {
  if (activeChatObj && (activeChatObj.type === 'group' || activeChatObj.type === 'channel')) {
    openMembersModal();
  } else {
    openProfile();
  }
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
    const userMatches = allUsers.filter(u => u.username.toLowerCase().includes(q.toLowerCase()) || u.nickname.toLowerCase().includes(q.toLowerCase()));
    var allResults = [];
    userMatches.slice(0, 10).forEach(function(u) {
      allResults.push({ type: 'user', data: u });
    });
    fetch(API + '/api/chats/search?q=' + encodeURIComponent(q) + '&userId=' + currentUser.id + '&_t=' + Date.now())
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var chatResults = (data.chats || []).slice(0, 5);
        chatResults.forEach(function(c) {
          allResults.push({ type: c.type === 'channel' ? 'channel' : 'group', data: c });
        });
        renderSearchResults(allResults, q);
      }).catch(function() {
        renderSearchResults(allResults, q);
      });
  }, 200);
});

function renderSearchResults(results, q) {
  if (!results.length) {
    searchResultsDiv.innerHTML = '<div style="color:#52525b;font-size:13px;padding:10px 12px;">Not found</div>';
    searchResultsDiv.classList.remove('hidden');
    return;
  }
  searchResultsDiv.innerHTML = '';
  results.forEach(function(item) {
    if (item.type === 'user') {
      var u = item.data;
      var el = document.createElement('div');
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
      el.addEventListener('click', function() { searchResultsDiv.classList.add('hidden'); searchInput.value = ''; startChat(u); });
      searchResultsDiv.appendChild(el);
    } else {
      var c = item.data;
      var isChannel = item.type === 'channel';
      var el2 = document.createElement('div');
      el2.className = 'user-item';
      var icon = document.createElement('div');
      icon.className = 'chat-item-icon ' + (isChannel ? 'channel-icon' : 'group-icon');
      icon.style.cssText = 'width:36px;height:36px;border-radius:10px;font-size:0';
      if (isChannel) {
        icon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 8 14 13 2 18 6 17 11 21 18 13 22 12 18 11 11 5"/></svg>';
      } else {
        icon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
      }
      el2.appendChild(icon);
      var info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0';
      var nameEl = document.createElement('div');
      nameEl.className = 'user-name';
      nameEl.textContent = c.name || (isChannel ? 'Channel' : 'Group');
      info.appendChild(nameEl);
      var meta = document.createElement('div');
      meta.style.cssText = 'font-size:11px;color:var(--text-muted)';
      meta.textContent = '@' + c.username;
      info.appendChild(meta);
      el2.appendChild(info);
      el2.addEventListener('click', function() {
        searchResultsDiv.classList.add('hidden');
        searchInput.value = '';
        var existing = myChats.find(function(x) { return Number(x.id) === Number(c.id); });
        if (existing) {
          openGroupChat(existing);
        } else {
          joinAndOpenChat(c);
        }
      });
      searchResultsDiv.appendChild(el2);
    }
  });
  searchResultsDiv.classList.remove('hidden');
}

function joinAndOpenChat(chat) {
  fetch(API + '/api/chats/' + chat.id + '/join', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.error) { alert(data.error); return; }
    myChats.push(chat);
    renderChats();
    openGroupChat(chat);
    fetch(API + '/api/chats/' + chat.id + '/messages?userId=' + currentUser.id + '&_t=' + Date.now())
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.messages) {
          data.messages.forEach(function(m) {
            var exists = allMessages.some(function(x) { return x.id === m.id && x.type === m.type; });
            if (!exists) allMessages.push(m);
          });
          if (Number(activeChatId) === Number(chat.id)) renderMessages();
        }
      }).catch(function(){});
  }).catch(function() { alert('Connection error'); });
}

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

chatUserMeta.addEventListener('click', openProfileOrMembers);
chatAvatar.addEventListener('click', function() {
  if (activeChatObj && (activeChatObj.type === 'group' || activeChatObj.type === 'channel')) {
    if (Number(activeChatObj.owner_id) === Number(currentUser.id)) {
      chatAvatarInput.click();
      return;
    }
    var myRole = 'member';
    activeChatMembers.forEach(function(m) {
      if (Number(m.id) === Number(currentUser.id)) myRole = m.role;
    });
    if (myRole === 'admin') {
      chatAvatarInput.click();
      return;
    }
  }
  openProfileOrMembers();
});

chatAvatarInput.addEventListener('change', function() {
  var file = this.files[0];
  if (!file) return;
  if (file.size > 500 * 1024) { alert('Max 500KB'); this.value = ''; return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var max = 200;
      var w = img.width, h = img.height;
      if (w > max || h > max) { var r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      var dataUrl = c.toDataURL('image/jpeg', 0.8);
      fetch(API + '/api/chats/' + activeChatId + '/avatar', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, avatarUrl: dataUrl })
      }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.error) { alert(data.error); return; }
        activeChatObj.avatar_url = data.avatarUrl;
        var c = myChats.find(function(x) { return Number(x.id) === Number(activeChatId); });
        if (c) c.avatar_url = data.avatarUrl;
        var url = resolveAvatarUrl(data.avatarUrl);
        chatAvatar.style.backgroundImage = url ? 'url(' + url + ')' : 'none';
        chatAvatar.style.backgroundSize = 'cover';
        chatAvatar.style.background = url ? 'transparent' : (activeChatObj.type === 'channel' ? '#f59e0b' : '#10b981');
        chatAvatar.innerHTML = url ? '' : (activeChatObj.type === 'channel'
          ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 8 14 13 2 18 6 17 11 21 18 13 22 12 18 11 11 5"/></svg>'
          : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>');
        renderChats();
      }).catch(function() { alert('Upload failed'); });
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  this.value = '';
});
profileEyeBtn.addEventListener('click', openProfileOrMembers);

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

var ADMIN_USERNAMES = ['teardown777', 'pulse', 'minecraftch'];
var ADMIN_EMAILS = ['minecraftchuspan1@gmail.com', 'artemiiest@gmail.com'];

function isAdminUser() {
  if (!currentUser) return false;
  if (currentUser.username && ADMIN_USERNAMES.indexOf(currentUser.username.toLowerCase()) !== -1) return true;
  if (currentUser.email && ADMIN_EMAILS.indexOf(currentUser.email.toLowerCase()) !== -1) return true;
  return false;
}

function updateAdminBtn() {
  if (!adminBtn) return;
  if (isAdminUser()) {
    adminBtn.classList.remove('hidden');
  } else {
    adminBtn.classList.add('hidden');
  }
}

setTimeout(function retryAdmin() {
  if (adminBtn && isAdminUser()) {
    adminBtn.classList.remove('hidden');
  }
}, 3000);

adminBtn.addEventListener('click', function() {
  settingsPanel.classList.add('hidden');
  if (isAdminUser()) {
    openAdminPanel();
  }
});

adminClose.addEventListener('click', function() { adminPanel.style.display = 'none'; });
adminPanel.addEventListener('click', function(e) { if (e.target === adminPanel) adminPanel.style.display = 'none'; });

createChatBtn.addEventListener('click', function() {
  settingsPanel.classList.add('hidden');
  createChatModal.style.display = 'flex';
  createChatName.value = '';
  createChatUsername.value = '';
  createChatDesc.value = '';
  createChatError.textContent = '';
  createChatUsernameStatus.textContent = '';
  createType = 'group';
  createTypeGroup.classList.add('active');
  createTypeChannel.classList.remove('active');
});

createChatClose.addEventListener('click', function() { createChatModal.style.display = 'none'; });
createChatModal.addEventListener('click', function(e) { if (e.target === createChatModal) createChatModal.style.display = 'none'; });

membersClose.addEventListener('click', function() { membersModal.style.display = 'none'; });
membersModal.addEventListener('click', function(e) { if (e.target === membersModal) membersModal.style.display = 'none'; });

createTypeGroup.addEventListener('click', function() {
  createType = 'group';
  createTypeGroup.classList.add('active');
  createTypeChannel.classList.remove('active');
});

createTypeChannel.addEventListener('click', function() {
  createType = 'channel';
  createTypeChannel.classList.add('active');
  createTypeGroup.classList.remove('active');
});

var createUsernameTimer;
createChatUsername.addEventListener('input', function() {
  clearTimeout(createUsernameTimer);
  var val = createChatUsername.value.trim().replace('@', '');
  createChatUsernameStatus.textContent = '';
  if (!val || val.length < 3) return;
  createChatUsernameStatus.textContent = 'Checking...';
  createUsernameTimer = setTimeout(function() {
    fetch(API + '/api/username/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: val })
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.available) createChatUsernameStatus.textContent = 'Available';
      else createChatUsernameStatus.textContent = 'Taken';
      createChatUsernameStatus.style.color = data.available ? '#22c55e' : '#ef4444';
    }).catch(function() { createChatUsernameStatus.textContent = ''; });
  }, 400);
});

createChatSubmit.addEventListener('click', function() {
  var name = createChatName.value.trim();
  var username = createChatUsername.value.trim().replace('@', '');
  var desc = createChatDesc.value.trim();
  if (!name) { createChatError.textContent = 'Name is required'; return; }
  createChatError.textContent = 'Creating...';
  createChatSubmit.disabled = true;
  fetch(API + '/api/chats/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.id, name: name, type: createType, username: username || undefined, description: desc })
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.error) { createChatError.textContent = data.error; createChatSubmit.disabled = false; return; }
    createChatModal.style.display = 'none';
    createChatSubmit.disabled = false;
    if (data.chat) openGroupChat(data.chat);
  }).catch(function() { createChatError.textContent = 'Connection error'; createChatSubmit.disabled = false; });
});

createChatName.addEventListener('keydown', function(e) { if (e.key === 'Enter') createChatSubmit.click(); });
createChatUsername.addEventListener('keydown', function(e) { if (e.key === 'Enter') createChatSubmit.click(); });
createChatDesc.addEventListener('keydown', function(e) { if (e.key === 'Enter') createChatSubmit.click(); });

var adminTab = 'users';
var allAdminUsers = [];
var allAdminChats = [];

function openAdminPanel() {
  adminBody.innerHTML = '<div style="color:#52525b;text-align:center;padding:20px;">Loading...</div>';
  adminPanel.style.display = 'flex';
  adminTab = 'users';
  $('admin-tab-users').classList.add('active');
  $('admin-tab-chats').classList.remove('active');
  $('admin-search-input').value = '';
  loadAdminUsers();
}

function loadAdminUsers() {
  fetch(API + '/api/admin/users?adminId=' + currentUser.id)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      allAdminUsers = data.users || [];
      loadAdminChats();
    }).catch(function() { adminBody.innerHTML = '<div style="color:#ef4444;text-align:center;padding:20px;">Failed to load</div>'; });
}

function loadAdminChats() {
  fetch(API + '/api/admin/chats?adminId=' + currentUser.id)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      allAdminChats = data.chats || [];
      renderAdminPanel('');
    }).catch(function() {});
}

function renderAdminPanel(filter) {
  adminBody.innerHTML = '';
  var q = filter.toLowerCase();
  if (adminTab === 'users') {
    var matches = allAdminUsers.filter(function(u) { return u.username.toLowerCase().indexOf(q) !== -1 || u.nickname.toLowerCase().indexOf(q) !== -1 || (u.email && u.email.toLowerCase().indexOf(q) !== -1); });
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
            renderAdminPanel($('admin-search-input').value);
          }).catch(function() {});
        });
        row.appendChild(btn);
      });
      adminBody.appendChild(row);
    });
  } else {
    var matches = allAdminChats.filter(function(c) { return (c.name && c.name.toLowerCase().indexOf(q) !== -1) || (c.username && c.username.toLowerCase().indexOf(q) !== -1); });
    if (!matches.length) {
      adminBody.innerHTML = '<div style="color:#52525b;text-align:center;padding:20px;">Not found</div>';
      return;
    }
    matches.forEach(function(c) {
      var row = document.createElement('div');
      row.className = 'admin-user-item';
      var info = document.createElement('div');
      info.className = 'admin-user-info';
      var nameRow = document.createElement('div');
      nameRow.className = 'admin-user-name';
      nameRow.textContent = c.name || (c.type === 'channel' ? 'Channel' : 'Group');
      var labelEl = createLabelHtml(c.label);
      if (labelEl) nameRow.appendChild(labelEl);
      info.appendChild(nameRow);
      var emailRow = document.createElement('div');
      emailRow.className = 'admin-user-email';
      emailRow.textContent = '@' + c.username + ' — ' + c.type;
      info.appendChild(emailRow);
      row.appendChild(info);
      ['verified', 'scam'].forEach(function(lbl) {
        var btn = document.createElement('button');
        btn.className = 'admin-label-btn' + (c.label === lbl ? ' active-' + lbl : '');
        btn.textContent = lbl === 'verified' ? 'Verified' : 'SCAM';
        btn.addEventListener('click', function() {
          var newLabel = c.label === lbl ? '' : lbl;
          fetch(API + '/api/chats/' + c.id + '/label?adminId=' + currentUser.id, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: newLabel })
          }).then(function(r) { return r.json(); }).then(function() {
            c.label = newLabel;
            renderAdminPanel($('admin-search-input').value);
          }).catch(function() {});
        });
        row.appendChild(btn);
      });
      adminBody.appendChild(row);
    });
  }
}

$('admin-tab-users').addEventListener('click', function() {
  adminTab = 'users';
  $('admin-tab-users').classList.add('active');
  $('admin-tab-chats').classList.remove('active');
  $('admin-search-input').value = '';
  renderAdminPanel('');
});

$('admin-tab-chats').addEventListener('click', function() {
  adminTab = 'chats';
  $('admin-tab-chats').classList.add('active');
  $('admin-tab-users').classList.remove('active');
  $('admin-search-input').value = '';
  if (!allAdminChats.length) loadAdminChats();
  else renderAdminPanel('');
});

document.getElementById('admin-search-input').addEventListener('input', function() {
  renderAdminPanel(this.value);
});

function startChat(user) {
  activeUserId = user.id;
  activeUserObj = user;
  activeChatObj = null;
  activeChatMembers = [];
  renderChats();
  profileEyeBtn.style.display = '';
  profileEyeBtn.title = 'View profile';
  profileEyeBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  showInputArea();
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
      
      var isGroup = activeChatObj && (activeChatObj.type === 'group' || activeChatObj.type === 'channel');
      var showSender = !isOwn || isGroup;
      let contentHtml = '';
      if (m.type === 'photo') {
        contentHtml = `
          <div class="photo-message">
            <img src="${m.image_url}" class="photo-img" alt="Photo">
            ${m.caption ? `<div class="photo-caption">${m.caption}</div>` : ''}
          </div>
        `;
      } else {
        contentHtml = m.content;
      }

      div.innerHTML = `
        ${showSender ? `<div class="msg-sender">${m.sender_name}</div>` : ''}
        ${contentHtml}
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
  if (!activeChatId || !socket || !socket.connected) return;
  if (pendingPhoto) {
    const caption = messageInput.value.trim();
    messageInput.value = '';
    emitTypingStop();
    fetch(API + '/api/messages/photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        chatId: activeChatId,
        imageData: pendingPhoto,
        caption: caption
      })
    }).then(function(res) {
      if (!res.ok) res.json().then(function(d) { alert(d.error || 'Upload failed'); });
    }).catch(function() { alert('Connection error'); });
    pendingPhoto = null;
    photoPendingBar.style.display = 'none';
    messageInput.placeholder = 'Type a message...';
    return;
  }
  const content = messageInput.value.trim();
  if (!content) return;
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
