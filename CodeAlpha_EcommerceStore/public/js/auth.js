const TOKEN_KEY = 'codealpha_token';
const USER_KEY = 'codealpha_user';

function saveAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getAuthUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    const user = raw ? JSON.parse(raw) : null;
    return user && typeof user === 'object' ? user : null;
  } catch (error) {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.location.href = '/';
}

function updateAuthNav() {
  const area = document.getElementById('auth-area');
  if (!area) return;

  const user = getAuthUser();

  if (user && user.name) {
    area.innerHTML = `
      <a href="/my-orders.html">My Orders</a>
      <span class="nav-user">Hi, ${escapeHtmlName(user.name)}</span>
      <a href="#" id="logout-link">Logout</a>
    `;
    const logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
      logoutLink.addEventListener('click', (event) => {
        event.preventDefault();
        logout();
      });
    }
  } else {
    area.innerHTML = `
      <a href="/login.html">Login</a>
      <a href="/register.html">Register</a>
    `;
  }
}

function escapeHtmlName(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(value ?? '').replace(/[&<>"']/g, (char) => map[char]);
}

async function fetchWithAuth(url, options = {}) {
  const token = getToken();
  const headers = Object.assign({}, options.headers);

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, Object.assign({}, options, { headers }));
}

updateCartCount();
updateAuthNav();
