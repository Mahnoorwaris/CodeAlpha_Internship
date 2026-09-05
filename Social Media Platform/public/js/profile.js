(function () {
  'use strict';

  function q(sel, root) {
    return (root || document).querySelector(sel);
  }

  function renderAuth(notice) {
    Ctx.showView('auth');
    const view = document.getElementById('view-auth');
    view.innerHTML = TPL.authView(notice || '');
  }

  function switchTab(name) {
    q('[data-action="switch-tab"][data-tab="login"]').classList.toggle('active', name === 'login');
    q('[data-action="switch-tab"][data-tab="register"]').classList.toggle('active', name === 'register');
    document.getElementById('pane-login').hidden = name !== 'login';
    document.getElementById('pane-register').hidden = name !== 'register';
    const errBox = document.getElementById('auth-error');
    if (errBox) errBox.textContent = '';
  }

  function showAuthError(message) {
    const errBox = document.getElementById('auth-error');
    if (errBox) errBox.innerHTML = '<div class="form-error">' + UI.escapeHtml(message) + '</div>';
  }

  function doLogin(form) {
    const btn = q('button', form);
    UI.setBusy(btn, true);
    API.post('/api/auth/login', {
      email: form.elements.email.value.trim(),
      password: form.elements.password.value,
    })
      .then(function (r) {
        Store.login(r.token, r.user);
        Ctx.toast('Welcome back, ' + (r.user.name || r.user.username) + '!');
        Ctx.go('#/feed');
      })
      .catch(function (err) {
        showAuthError(err.message || 'Login failed');
      })
      .finally(function () {
        UI.setBusy(btn, false);
      });
  }

  function doRegister(form) {
    const btn = q('button', form);
    UI.setBusy(btn, true);
    API.post('/api/auth/register', {
      name: form.elements.name.value.trim(),
      username: form.elements.username.value.trim().toLowerCase(),
      email: form.elements.email.value.trim(),
      password: form.elements.password.value,
    })
      .then(function (r) {
        Store.login(r.token, r.user);
        Ctx.toast('Account created. Welcome, ' + (r.user.name || r.user.username) + '!');
        Ctx.go('#/feed');
      })
      .catch(function (err) {
        showAuthError(err.message || 'Registration failed');
      })
      .finally(function () {
        UI.setBusy(btn, false);
      });
  }

  function renderProfile(username) {
    Ctx.showView('profile');
    const card = q('#profile-card');
    const editSlot = q('#profile-edit-slot');
    card.innerHTML = UI.spinnerHtml();
    editSlot.innerHTML = '';
    API.get('/api/users/' + encodeURIComponent(username))
      .then(function (r) {
        const me = Store.getUser();
        const p = r.profile;
        const own = !!me && String(p.id) === String(me.id);
        card.innerHTML = TPL.profileHeader(p);
        editSlot.innerHTML = own && me ? TPL.profileEdit(me) : '';
        if (!me) {
          editSlot.innerHTML =
            '<div class="card"><p style="margin:0 0 10px">Log in to follow ' +
            UI.escapeHtml(p.name || p.username) + ' and join the conversation.</p>' +
            '<button type="button" class="btn" data-action="goto-auth">Log in</button></div>';
        }
      })
      .catch(function (err) {
        card.innerHTML = UI.emptyStateHtml(
          err.status === 404 ? 'User "' + username + '" not found.' : err.message || 'Could not load profile.'
        );
      });
  }

  function saveProfile(form) {
    const btn = q('button', form);
    UI.setBusy(btn, true);
    const body = {
      name: form.elements.name.value.trim(),
      username: form.elements.username.value.trim().toLowerCase(),
      profilePicture: form.elements.profilePicture.value.trim(),
      bio: form.elements.bio.value.trim(),
    };
    API.put('/api/users/profile', body)
      .then(function (r) {
        const oldUsername = Store.getUser().username;
        Store.updateUser(r.user);
        UI.toast('Profile updated');
        if (r.user.username !== oldUsername) {
          Ctx.go('#/profile/' + encodeURIComponent(r.user.username));
        } else {
          renderProfile(r.user.username);
        }
      })
      .catch(function (err) {
        UI.toast(err.message || 'Could not update profile', 'error');
      })
      .finally(function () {
        UI.setBusy(btn, false);
      });
  }

  window.Profile = {
    renderAuth: renderAuth,
    renderProfile: renderProfile,
    act: function (action, btn) {
      if (action === 'switch-tab') switchTab(btn.dataset.tab);
    },
    submit: function (form) {
      switch (form.dataset.form) {
        case 'login':
          doLogin(form);
          break;
        case 'register':
          doRegister(form);
          break;
        case 'edit-profile':
          saveProfile(form);
          break;
      }
    },
  };
})();
