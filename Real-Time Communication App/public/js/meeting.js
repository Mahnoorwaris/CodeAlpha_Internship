const $ = (id) => document.getElementById(id);

const state = {
  socket: null,
  webrtc: null,
  whiteboard: null,
  roomId: null,
  selfSocketId: null,
  selfUser: null,
  localStream: null,
  tiles: new Map(),
  screenSharing: false,
  remoteNames: new Map(), // socketId -> name
};

const getToken = () => localStorage.getItem('token');
const getUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
};
const getRoomId = () => new URLSearchParams(window.location.search).get('room');
const createIframeSafe = (text) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

const showError = (message) => {
  const el = $('meeting-error');
  if (el) {
    el.textContent = message;
    el.classList.remove('hidden');
  }
};

const ensureTile = (socketId, name) => {
  let tile = state.tiles.get(socketId);
  if (!tile) {
    tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.dataset.socketId = socketId;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;

    const label = document.createElement('div');
    label.className = 'participant-name';

    tile.appendChild(video);
    tile.appendChild(label);

    $('video-grid').appendChild(tile);
    state.tiles.set(socketId, { tile, video, label });
  }
  if (name) {
    state.tiles.get(socketId).label.textContent = name;
    state.remoteNames.set(socketId, name);
  }
  return state.tiles.get(socketId);
};

const setVideoStream = (socketId, stream) => {
  const entry = ensureTile(socketId, 'You');
  entry.video.srcObject = stream;
};

const setRemoteStream = (socketId, stream) => {
  const name = state.remoteNames.get(socketId) || 'Participant';
  const entry = ensureTile(socketId, name);
  entry.video.srcObject = stream;
};

const removeTile = (socketId) => {
  const entry = state.tiles.get(socketId);
  if (entry) {
    entry.video.srcObject = null;
    entry.tile.remove();
    state.tiles.delete(socketId);
    state.remoteNames.delete(socketId);
  }
};

const displayName = (participant) => {
  if (participant.socketId === state.selfSocketId) return 'You';
  const stored = state.remoteNames.get(participant.socketId);
  return participant.name || stored || 'Participant';
};

const renderParticipants = (list) => {
  const ul = $('participant-list');
  if (!ul) return;
  ul.innerHTML = '';
  list.forEach((p) => {
    const li = document.createElement('li');
    const isSelf = p.self === true || p.socketId === state.selfSocketId;
    const name = isSelf ? 'You' : p.name || 'Participant';
    li.textContent = isSelf ? `${name} (you)` : name;
    ul.appendChild(li);
  });
};

/* ===== Chat ===== */
const appendChat = (data) => {
  const log = $('chat-log');
  const row = document.createElement('div');
  row.className = 'chat-msg';
  const isSelf = data.socketId === state.selfSocketId;
  row.classList.add(isSelf ? 'chat-self' : 'chat-other');
  const time = data.time ? new Date(data.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  row.innerHTML = `<span class="chat-meta">${createIframeSafe(data.name || 'User')} · ${time}</span><span class="chat-text">${createIframeSafe(data.text)}</span>`;
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
};

/* ===== Files ===== */
const appendFileMessage = (data, isRemote) => {
  const log = $('file-log');
  const row = document.createElement('div');
  row.className = 'file-msg';
  const file = data.file;
  if (!file) return;
  const sizeKB = file.size ? Math.round(file.size / 1024) : 0;
  const time = data.time ? new Date(data.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  row.innerHTML = `
    <span class="file-meta">${createIframeSafe(data.name || 'User')} shared:</span>
    <a class="file-link" href="${file.url || '#'}" target="_blank" rel="noopener">${createIframeSafe(file.originalName || 'file')} (${sizeKB} KB)</a>
    <span class="file-time">${time}</span>`;
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
};

const loadRoomFiles = async () => {
  try {
    const res = await fetch(`/api/files/${encodeURIComponent(state.roomId)}/files`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    if (data.success && Array.isArray(data.files)) {
      data.files.forEach((f) => {
        appendFileMessage(
          { name: f.uploader, time: new Date(f.createdAt).getTime(), file: f },
          true
        );
      });
    }
  } catch (error) {
    console.error('loadRoomFiles error:', error.message);
  }
};

const uploadFile = async () => {
  const input = $('file-input');
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const fd = new FormData();
  fd.append('file', file);
  $('upload-btn').disabled = true;
  const btnText = $('upload-btn').textContent;
  $('upload-btn').textContent = 'Uploading...';
  try {
    const res = await fetch(`/api/files/${encodeURIComponent(state.roomId)}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.message || 'Upload failed');
      return;
    }
    const selfName = (state.selfUser && state.selfUser.name) || 'You';
    appendFileMessage(
      {
        socketId: state.selfSocketId,
        name: selfName,
        time: Date.now(),
        file: data.file,
      },
      false
    );
    state.socket.emit('file-shared', {
      roomId: state.roomId,
      file: data.file,
    });
  } catch (error) {
    showError('Upload failed. Check file type and size.');
  } finally {
    $('upload-btn').disabled = false;
    $('upload-btn').textContent = btnText;
    input.value = '';
  }
};

async function init() {
  const token = getToken();
  if (!token) {
    window.location.href = '/';
    return;
  }

  state.roomId = getRoomId();
  if (!state.roomId) {
    showError('No room ID provided.');
    return;
  }
  $('room-display-id').textContent = state.roomId;
  state.selfUser = getUser();

  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (error) {
    showError('Camera/microphone access denied. Check browser permissions and retry.');
    return;
  }

  const socket = io('/', {
    auth: { token, name: state.selfUser ? state.selfUser.name : 'User' },
    transports: ['websocket'],
  });
  state.socket = socket;

  state.webrtc = new WebRTCManager({
    socket,
    onRemoteStream: (socketId, stream) => setRemoteStream(socketId, stream),
    onParticipantState: (socketId, info) => {
      if (info.connectionState === 'failed') {
        console.warn(`Connection to ${socketId} failed`);
      }
    },
  });
  state.webrtc.localStream = state.localStream;
  state.webrtc.tracksEnabled = { audio: true, video: true };

  state.whiteboard = new Whiteboard({
    canvas: $('whiteboard'),
    socket,
    roomId: state.roomId,
  });

  socket.on('connect', () => {
    $('connection-status').textContent = 'Connected';
    socket.emit('join-room', state.roomId, (response) => {
      if (!response || !response.success) {
        showError('Could not join the room.');
        return;
      }
      state.selfSocketId = response.self.socketId;
      state.webrtc.setSelfSocketId(state.selfSocketId);
      setVideoStream(state.selfSocketId, state.localStream);

      // Seed the participant registry: self + existing participants.
      participantRegistry = response.participants.filter(
        (p) => p.socketId !== state.selfSocketId
      );
      addToParticipantList({
        socketId: state.selfSocketId,
        userId: response.self.userId,
        name: response.self.name || 'You',
      }, { self: true });

      response.participants.forEach((p) => {
        if (p.socketId !== state.selfSocketId) {
          state.remoteNames.set(p.socketId, p.name);
          ensureTile(p.socketId, p.name);
          state.webrtc.createPeer(p.socketId, true).catch((e) => console.error('peer init:', e));
        }
      });
      loadRoomFiles();
    });
  });

  socket.on('user-joined', (participant) => {
    if (participant.socketId !== state.selfSocketId) {
      state.remoteNames.set(participant.socketId, participant.name);
      ensureTile(participant.socketId, participant.name);
      // Only the joining peer initiates the connection to avoid both
      // sides sending offers (glare). Existing members just wait for the
      // joiner's offer and answer it.
      state.webrtc
        .createPeer(participant.socketId, participant.isInitiator || false)
        .catch((e) => console.error('peer join:', e));
    }
    addToParticipantList(participant);
  });

  socket.on('webrtc-offer', async (payload) => {
    try {
      await state.webrtc.handleOffer(payload);
    } catch (error) {
      console.error('handleOffer error:', error.message);
    }
  });

  socket.on('webrtc-answer', async (payload) => {
    try {
      await state.webrtc.handleAnswer(payload);
    } catch (error) {
      console.error('handleAnswer error:', error.message);
    }
  });

  socket.on('ice-candidate', async (payload) => {
    try {
      await state.webrtc.handleIceCandidate(payload);
    } catch (error) {
      console.error('candidate error:', error.message);
    }
  });

  socket.on('user-left', (payload) => {
    state.webrtc.removePeer(payload.socketId);
    removeTile(payload.socketId);
    removeFromParticipantList(payload.socketId);
  });

  socket.on('message', (data) => appendChat(data));

  socket.on('whiteboard-draw', (segment) => {
    const wb = state.whiteboard;
    if (!wb) return;
    if (segment.start) wb.remoteLast = null;
    wb.applyRemote(segment);
  });

  socket.on('whiteboard-clear', () => {
    if (state.whiteboard) state.whiteboard.clear();
  });

  socket.on('file-shared', (data) => {
    appendFileMessage(data, true);
  });

  wireControls();
  wirePanel();
}

let participantRegistry = [];

const addToParticipantList = (p, opts) => {
  const isSelf = opts && opts.self;
  const exists = participantRegistry.some((x) => x.socketId === p.socketId);
  if (!exists) {
    participantRegistry.push({ ...p, self: !!isSelf });
  } else if (isSelf) {
    const idx = participantRegistry.findIndex((x) => x.socketId === p.socketId);
    if (idx >= 0) participantRegistry[idx].self = true;
  }
  renderParticipants(participantRegistry);
};

const removeFromParticipantList = (socketId) => {
  participantRegistry = participantRegistry.filter((x) => x.socketId !== socketId);
  renderParticipants(participantRegistry);
};

function wireControls() {
  $('mic-btn').addEventListener('click', () => {
    const enabled = !state.webrtc.tracksEnabled.audio;
    state.webrtc.setTrackEnabled('audio', enabled);
    $('mic-btn').classList.toggle('off', !enabled);
    $('mic-btn').textContent = enabled ? '🎤' : '🔇';
  });

  $('camera-btn').addEventListener('click', () => {
    const enabled = !state.webrtc.tracksEnabled.video;
    state.webrtc.setTrackEnabled('video', enabled);
    $('camera-btn').classList.toggle('off', !enabled);
    $('camera-btn').textContent = enabled ? '📹' : '🚫';
  });

  $('screen-btn').addEventListener('click', async () => {
    state.screenSharing = await state.webrtc.toggleScreenShare();
    $('screen-btn').classList.toggle('off', state.screenSharing);
    $('screen-btn').textContent = state.screenSharing ? '🟥' : '🖥️';
  });

  $('leave-btn').addEventListener('click', () => {
    leaveMeeting();
  });

  window.addEventListener('beforeunload', () => {
    leaveMeeting(false);
  });

  /* chat */
  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('chat-input');
    const text = input.value.trim();
    if (!text) return;
    state.socket.emit('send-message', { text, roomId: state.roomId }, () => {});
    input.value = '';
  });

  /* files */
  $('upload-btn').addEventListener('click', uploadFile);

  /* whiteboard controls */
  document.querySelectorAll('.wb-btn[data-color]').forEach((btn) => {
    btn.style.backgroundColor = btn.dataset.color;
    btn.addEventListener('click', () => {
      if (state.whiteboard) state.whiteboard.color = btn.dataset.color;
    });
  });
  $('wb-size').addEventListener('input', (e) => {
    if (state.whiteboard) state.whiteboard.size = parseInt(e.target.value, 10);
  });
  $('wb-clear').addEventListener('click', () => {
    if (state.whiteboard) state.whiteboard.clear();
  });
}

function leaveMeeting(redirect = true) {
  if (state.socket) {
    state.socket.emit('leave-room', state.roomId);
  }
  if (state.webrtc) state.webrtc.closeAll();
  if (redirect) {
    window.location.href = '/pages/dashboard.html';
  }
}

function wirePanel() {
  const panel = $('side-panel');
  const panelBtn = $('panel-btn');
  panelBtn.addEventListener('click', () => {
    panel.classList.toggle('hidden');
  });

  document.querySelectorAll('.panel-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.panel-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.panel-view').forEach((v) => v.classList.remove('active'));
      const view = $('view-' + tab.dataset.panel);
      if (view) view.classList.add('active');
      if (tab.dataset.panel === 'whiteboard' && state.whiteboard) {
        state.whiteboard.resize();
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', init);