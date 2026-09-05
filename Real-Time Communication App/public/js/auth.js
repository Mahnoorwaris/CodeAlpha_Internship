const API_URL = '/api/auth';

const $ = (id) => document.getElementById(id);

const showMessage = (element, message, type) => {
  element.textContent = message;
  element.className = 'auth-message ' + type;
};

const hideMessage = (element) => {
  element.className = 'auth-message hidden';
};

const setProtectedForms = () => {
  const token = localStorage.getItem('token');
  if (token && window.location.pathname === '/') {
    window.location.href = '/pages/dashboard.html';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  setProtectedForms();
  const isAuthPage = $() && $('login-form');

  if (!$('login-form')) return;

  hideMessage($('auth-message'));

  const tabLogin = $('tab-login');
  const tabRegister = $('tab-register');
  const loginForm = $('login-form');
  const registerForm = $('register-form');

  const switchTab = (which) => {
    const isLogin = which === 'login';
    tabLogin.classList.toggle('active', isLogin);
    tabRegister.classList.toggle('active', !isLogin);
    loginForm.classList.toggle('hidden', !isLogin);
    registerForm.classList.toggle('hidden', isLogin);
    hideMessage($('auth-message'));
  };

  tabLogin.addEventListener('click', () => switchTab('login'));
  tabRegister.addEventListener('click', () => switchTab('register'));

  const disable = (btn, disabled) => (btn.disabled = disabled);

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = loginForm.querySelector('button[type="submit"]');
    const msg = $('auth-message');
    const email = $('login-email').value.trim();
    const password = $('login-password').value;

    if (!email || !password) {
      showMessage(msg, 'Please fill in all fields', 'error');
      return;
    }

    disable(btn, true);
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage(msg, data.message || 'Login failed', 'error');
      } else {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = '/pages/dashboard.html';
      }
    } catch (error) {
      showMessage(msg, 'Network error. Please try again.', 'error');
    } finally {
      disable(btn, false);
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = registerForm.querySelector('button[type="submit"]');
    const msg = $('auth-message');
    const name = $('register-name').value.trim();
    const email = $('register-email').value.trim();
    const password = $('register-password').value;

    if (!name || !email || !password) {
      showMessage(msg, 'Please fill in all fields', 'error');
      return;
    }
    if (password.length < 8) {
      showMessage(msg, 'Password must be at least 8 characters', 'error');
      return;
    }

    disable(btn, true);
    try {
      const res = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage(msg, data.message || 'Registration failed', 'error');
      } else {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = '/pages/dashboard.html';
      }
    } catch (error) {
      showMessage(msg, 'Network error. Please try again.', 'error');
    } finally {
      disable(btn, false);
    }
  });
});