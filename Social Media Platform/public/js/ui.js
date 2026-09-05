(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function timeAgo(iso) {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 604800) return Math.floor(s / 86400) + 'd ago';
    return new Date(then).toLocaleDateString();
  }

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  function avatarHtml(user, cls) {
    cls = cls || '';
    const name = user && user.name ? user.name : '?';
    let img = '';
    if (user && typeof user.profilePicture === 'string' && /^https?:\/\//i.test(user.profilePicture.trim())) {
      img = '<img src="' + escapeHtml(user.profilePicture.trim()) + '" alt="" onerror="this.remove()" />';
    }
    return (
      '<span class="avatar ' + escapeHtml(cls) + '" title="@' + escapeHtml(user && user.username) + '">' +
      '<span>' + escapeHtml(initials(name)) + '</span>' + img + '</span>'
    );
  }

  function spinnerHtml(label) {
    return '<div class="spinner" role="status" aria-label="' + escapeHtml(label || 'Loading') + '"></div>';
  }

  function emptyStateHtml(message) {
    return '<div class="empty-state">' + escapeHtml(message) + '</div>';
  }

  function toast(message, type) {
    type = type || 'success';
    let root = document.getElementById('toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'toast-root';
      root.className = 'toast-root';
      document.body.appendChild(root);
    }
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.textContent = message;
    el.addEventListener('click', function () {
      el.remove();
    });
    root.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 4000);
  }

  function setBusy(button, busy) {
    if (!button) return;
    if (busy) {
      // Already busy? Keep the ORIGINAL stored label - never re-snapshot 'Working…'
      if (button.dataset.busy === '1') return;
      button.dataset.busy = '1';
      button.dataset.label = button.textContent;
      button.disabled = true;
      button.textContent = 'Working…';
    } else {
      // Idempotent: safe to call twice; restores whatever label is current truth
      if (button.dataset.busy !== '1' && !button.disabled) return;
      delete button.dataset.busy;
      button.disabled = false;
      if (button.dataset.label !== undefined) button.textContent = button.dataset.label;
      delete button.dataset.label;
    }
  }

  if (typeof window !== 'undefined') {
    window.UI = {
      escapeHtml: escapeHtml,
      timeAgo: timeAgo,
      avatarHtml: avatarHtml,
      spinnerHtml: spinnerHtml,
      emptyStateHtml: emptyStateHtml,
      toast: toast,
      setBusy: setBusy,
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { escapeHtml: escapeHtml, timeAgo: timeAgo, initials: initials, setBusy: setBusy };
  }
})();
