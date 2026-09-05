const form = document.getElementById('register-form');
const errorBox = document.getElementById('form-error');
const submitBtn = document.getElementById('submit-btn');

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const name = form.name.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;

  if (!name || !email || !password) {
    showError('Please fill in all fields.');
    return;
  }
  if (password.length < 6) {
    showError('Password must be at least 6 characters.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Registering...';
  errorBox.hidden = true;

  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {
      throw new Error(result.message || `Registration failed (status ${response.status})`);
    }

    saveAuth(result.token, result.data);
    const redirectTo = new URLSearchParams(window.location.search).get('redirect');
    window.location.href = redirectTo && redirectTo.startsWith('/') ? redirectTo : '/';
  } catch (error) {
    console.error('Registration failed:', error);
    showError(error.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Register';
  }
});
