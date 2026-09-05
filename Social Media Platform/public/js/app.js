(function () {
  'use strict';

  window.Ctx = {
    showView: function (name) {
      ['auth', 'feed', 'suggestions', 'profile'].forEach(function (v) {
        document.getElementById('view-' + v).hidden = v !== name;
      });
      Ctx.updateNav(name);
      window.scrollTo(0, 0);
    },
    updateNav: function (active) {
      const links = document.getElementById('nav-links');
      links.hidden = !Store.isLoggedIn();
      links.querySelectorAll('a[data-nav]').forEach(function (a) {
        a.classList.toggle('active', a.dataset.nav === active);
      });
    },
    go: function (hash) {
      if (location.hash === hash) router();
      else location.hash = hash;
    },
    toast: UI.toast,
  };

  function router() {
    const h = location.hash || '#/feed';
    if (!Store.isLoggedIn()) {
      // Public profiles are viewable without an account; everything else needs auth
      if (h.indexOf('#/profile/') === 0) {
        Profile.renderProfile(decodeURIComponent(h.slice('#/profile/'.length)));
      } else {
        Profile.renderAuth();
      }
      return;
    }
    if (h.indexOf('#/profile/') === 0) {
      Profile.renderProfile(decodeURIComponent(h.slice('#/profile/'.length)));
    } else if (h === '#/suggestions') {
      Feed.renderSuggestions();
    } else if (h === '#/profile') {
      Profile.renderProfile(Store.getUser().username);
    } else {
      Feed.renderFeed();
    }
  }
  window.router = router;

  const CLICK_ROUTES = {
    'switch-tab': Profile,
    like: Feed,
    'toggle-comments': Feed,
    'start-comment-edit': Feed,
    'cancel-comment-edit': Feed,
    'delete-comment': Feed,
    'start-post-edit': Feed,
    'cancel-post-edit': Feed,
    'delete-post': Feed,
    'retry-feed': Feed,
  };

  function onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'follow-toggle') return followToggle(btn);
    if (action === 'goto-auth') {
      location.hash = '#/';
      Profile.renderAuth();
      return;
    }
    const mod = CLICK_ROUTES[action];
    if (mod && mod.act) mod.act(action, btn);
  }

  function onSubmit(e) {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    const kind = form.dataset.form;
    if (kind === 'login' || kind === 'register' || kind === 'edit-profile') Profile.submit(form);
    else Feed.submit(form);
  }

  function followToggle(btn) {
    const userId = btn.dataset.userId;
    const following = Store.followedHas(userId);
    UI.setBusy(btn, true);
    const req = following ? API.del('/api/users/' + userId + '/follow') : API.post('/api/users/' + userId + '/follow');
    req
      .then(function (res) {
        Store.setFollowed(userId, !following);
        document.querySelectorAll('[data-action="follow-toggle"][data-user-id="' + CSS.escape(userId) + '"]').forEach(function (b) {
          b.textContent = !following ? 'Unfollow' : 'Follow';
          b.dataset.label = b.textContent; // sync pending busy-restore with new state
          b.classList.toggle('btn-ghost', !following);
        });
        const followersStat = document.getElementById('stat-followers');
        if (followersStat && typeof res.followersCount === 'number') followersStat.textContent = String(res.followersCount);
        Ctx.toast(!following ? 'You are now following this user' : 'Unfollowed');
      })
      .catch(function (err) {
        UI.toast(err.message || 'Could not update follow state', 'error');
      })
      .finally(function () {
        UI.setBusy(btn, false);
      });
  }

  function onSessionExpired() {
    Store.logout();
    Profile.renderAuth('Your session has expired or is invalid. Please log in again.');
  }

  function boot() {
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('session-expired', onSessionExpired);
    document.getElementById('logout-btn').addEventListener('click', function () {
      Store.logout();
      location.hash = '#/';
      Profile.renderAuth();
      UI.toast('Logged out', 'info');
    });

    window.addEventListener('hashchange', router);

    if (!Store.hasToken()) {
      // Deep links to public profiles still work without a session
      if ((location.hash || '').indexOf('#/profile/') === 0) router();
      else Profile.renderAuth();
      return;
    }
    API.get('/api/auth/me')
      .then(function (r) {
        Store.login(API.getToken(), r.user);
        router();
      })
      .catch(function () {
        if (!Store.isLoggedIn()) Profile.renderAuth();
      });
  }

  boot();
})();
