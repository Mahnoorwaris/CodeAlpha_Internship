const API_URL = '/api';

const $ = (id) => document.getElementById(id);

const showMessage = (element, message, type) => {
  element.textContent = message;
  element.className = 'auth-message ' + type;
};

const getToken = () => localStorage.getItem('token');
const getUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
};

const requireAuth = () => {
  const token = getToken();
  if (!token) {
    window.location.href = '/';
    return false;
  }
  return true;
};

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  const nameEl = $('user-name');
  const user = getUser();
  if (user && user.name) {
    nameEl.textContent = user.name;
  } else {
    fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((res) => {
        if (res.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/';
          return null;
        }
        if (!res.ok) throw new Error('Failed to load user');
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        localStorage.setItem('user', JSON.stringify(data.user));
        nameEl.textContent = data.user.name || 'User';
      })
      .catch(() => showMessage($('dashboard-message'), 'Could not load user details.', 'error'));
  }

  const msg = $('dashboard-message');

  $('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
  });

  $('create-meeting-btn').addEventListener('click', async () => {
    $('create-meeting-btn').disabled = true;
    showMessage(msg, 'Creating meeting...', 'success');
    try {
      const res = await fetch(`${API_URL}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not create meeting');
      window.location.href = `/pages/meeting.html?room=${data.room.id}`;
    } catch (error) {
      showMessage(msg, error.message, 'error');
      $('create-meeting-btn').disabled = false;
    }
  });

  $('join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const roomId = $('join-room-id').value.trim();
    if (!roomId) return;

    try {
      const res = await fetch(`${API_URL}/rooms/${encodeURIComponent(roomId)}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not join meeting');
      window.location.href = `/pages/meeting.html?room=${encodeURIComponent(roomId)}`;
    } catch (error) {
      showMessage(msg, error.message, 'error');
    }
  });
});