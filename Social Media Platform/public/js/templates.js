(function () {
  'use strict';

  const E = UI.escapeHtml;
  const httpUrl = function (u) {
    return typeof u === 'string' && /^https?:\/\/\S+$/i.test(u.trim());
  };

  window.TPL = {
    authView: function (notice) {
      return (
        (notice ? '<div class="form-error">' + E(notice) + '</div>' : '') +
        '<div class="card auth-card">' +
        '<div class="tabs">' +
        '<button type="button" class="tab active" data-action="switch-tab" data-tab="login">Login</button>' +
        '<button type="button" class="tab" data-action="switch-tab" data-tab="register">Register</button>' +
        '</div>' +
        '<div id="auth-error"></div>' +
        '<form data-form="login" id="pane-login">' +
        '<label for="login-email">Email</label><input id="login-email" name="email" type="email" required autocomplete="email" />' +
        '<label for="login-password">Password</label><input id="login-password" name="password" type="password" required minlength="6" autocomplete="current-password" />' +
        '<button class="btn" style="margin-top:14px;width:100%">Login</button>' +
        '</form>' +
        '<form data-form="register" id="pane-register" hidden>' +
        '<label for="reg-name">Full name</label><input id="reg-name" name="name" required maxlength="50" />' +
        '<label for="reg-username">Username</label><input id="reg-username" name="username" required maxlength="20" pattern="[a-z0-9_]+" />' +
        '<div class="hint">3–20 characters: lowercase letters, numbers, underscore</div>' +
        '<label for="reg-email">Email</label><input id="reg-email" name="email" type="email" required autocomplete="email" />' +
        '<label for="reg-password">Password</label><input id="reg-password" name="password" type="password" required minlength="6" autocomplete="new-password" />' +
        '<div class="hint">At least 6 characters</div>' +
        '<button class="btn" style="margin-top:14px;width:100%">Create account</button>' +
        '</form>' +
        '</div>'
      );
    },

    composer: function () {
      return (
        '<div class="card"><form data-form="composer">' +
        '<textarea name="content" maxlength="2000" placeholder="Share something with the community…" required></textarea>' +
        '<input name="imageUrl" maxlength="500" placeholder="Optional image URL (https://…)" style="margin-top:8px" />' +
        '<div style="display:flex;justify-content:flex-end;margin-top:10px">' +
        '<button class="btn">Post</button></div></form></div>'
      );
    },

    postCard: function (p) {
      const mine = String(p.author.id) === String(Store.getUser().id);
      const liked = Store.likedHas(p.id);
      const entry = Store.commentsEntry(p.id);
      const countHtml = entry.loaded ? String(entry.list.length) : '';
      const img =
        httpUrl(p.imageUrl) &&
        '<img class="post-image" src="' + E(p.imageUrl.trim()) + '" alt="Post image" onerror="this.remove()" />';
      return (
        '<article class="card post-card" data-post-id="' + E(p.id) + '">' +
        '<div class="post-head">' +
        '<a href="#/profile/' + encodeURIComponent(p.author.username) + '">' + UI.avatarHtml(p.author) + '</a>' +
        '<div style="flex:1;min-width:0">' +
        '<a class="author-name" href="#/profile/' + encodeURIComponent(p.author.username) + '">' + E(p.author.name || p.author.username) + '</a>' +
        '<div class="meta">@' + E(p.author.username) + ' · ' + UI.timeAgo(p.createdAt) + '</div></div>' +
        (mine
          ? '<button type="button" class="link-btn" data-action="start-post-edit">Edit</button>' +
            '<button type="button" class="link-btn danger" data-action="delete-post">Delete</button>'
          : '') +
        '</div>' +
        '<div class="post-body"><div class="post-content">' + E(p.content) + '</div>' + (img || '') + '</div>' +
        '<div class="post-actions">' +
        '<button type="button" class="btn btn-sm like-btn' + (liked ? ' liked' : '') + '" data-action="like">' + (liked ? 'Unlike' : 'Like') + '</button>' +
        '<span class="likes-count" data-count>' + Number(p.likesCount || 0) + '</span>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-action="toggle-comments">Comments (<span data-c-count>' + countHtml + '</span>)</button>' +
        '</div>' +
        '<div class="comments-section" data-comments hidden></div>' +
        '</article>'
      );
    },

    commentsArea: function (postId) {
      const entry = Store.commentsEntry(postId);
      const myId = String(Store.getUser().id);
      if (!entry.loaded) return UI.spinnerHtml('Loading comments');
      const items = entry.list
        .map(function (c) {
          const own = String(c.author.id) === myId;
          const editingThis = Store.isEditing(c.id);
          return (
            '<div class="comment-item" data-comment-id="' + E(c.id) + '">' +
            UI.avatarHtml(c.author, 'avatar-sm') +
            '<div class="comment-bubble">' +
            '<div class="comment-head"><a href="#/profile/' + encodeURIComponent(c.author.username) + '">@' + E(c.author.username) + '</a> · ' + UI.timeAgo(c.createdAt) + '</div>' +
            (editingThis
              ? '<form data-form="save-comment-edit" data-comment-id="' + E(c.id) + '">' +
                '<textarea name="content" maxlength="500" required>' + E(c.content) + '</textarea>' +
                '<div class="edit-actions" style="margin-top:6px">' +
                '<button class="btn btn-sm">Save</button>' +
                '<button type="button" class="btn btn-ghost btn-sm" data-action="cancel-comment-edit">Cancel</button>' +
                '</div></form>'
              : '<div class="comment-content">' + E(c.content) + '</div>' +
                (own
                  ? '<div class="comment-actions">' +
                    '<button type="button" class="link-btn" data-action="start-comment-edit">Edit</button>' +
                    '<button type="button" class="link-btn danger" data-action="delete-comment">Delete</button></div>'
                  : '')) +
            '</div></div>'
          );
        })
        .join('');
      return (
        '<div class="comments-list">' +
        (items || UI.emptyStateHtml('No comments yet. Start the conversation!')) +
        '</div>' +
        '<form class="inline-form" data-form="add-comment" data-post-id="' + E(postId) + '">' +
        '<input name="content" maxlength="500" placeholder="Write a comment…" autocomplete="off" required />' +
        '<button class="btn btn-sm">Send</button></form>'
      );
    },

    userRow: function (u, following) {
      return (
        '<div class="card user-row suggestion-card" data-user-id="' + E(u.id) + '">' +
        '<a href="#/profile/' + encodeURIComponent(u.username) + '">' + UI.avatarHtml(u) + '</a>' +
        '<div class="user-meta">' +
        '<a class="author-name" href="#/profile/' + encodeURIComponent(u.username) + '">' + E(u.name || u.username) + '</a>' +
        '<div class="meta">@' + E(u.username) + '</div>' +
        (u.bio ? '<div class="bio">' + E(u.bio) + '</div>' : '') +
        '</div>' +
        '<button type="button" class="btn btn-sm' + (following ? ' btn-ghost' : '') + '" data-action="follow-toggle" data-user-id="' + E(u.id) + '">' +
        (following ? 'Unfollow' : 'Follow') +
        '</button></div>'
      );
    },

    profileHeader: function (p) {
      const me = Store.getUser();
      const own = !!me && String(p.id) === String(me.id);
      const following = !!me && Store.followedHas(p.id);
      return (
        '<div class="card">' +
        '<div class="profile-head">' +
        UI.avatarHtml(p, 'avatar-lg') +
        '<div class="profile-info">' +
        '<div style="font-size:1.2rem;font-weight:700">' + E(p.name || p.username) + '</div>' +
        '<div class="meta">@' + E(p.username) + ' · joined ' + UI.timeAgo(p.createdAt) + '</div>' +
        (p.bio ? '<p class="bio">' + E(p.bio) + '</p>' : '') +
        '</div>' +
        (!own
          ? '<button type="button" class="btn' + (following ? ' btn-ghost' : '') + '" data-action="follow-toggle" data-user-id="' + E(p.id) + '">' + (following ? 'Unfollow' : 'Follow') + '</button>'
          : '') +
        '</div>' +
        '<div class="profile-stats">' +
        '<div class="stat"><b id="stat-followers">' + Number(p.followersCount || 0) + '</b><span>Followers</span></div>' +
        '<div class="stat"><b id="stat-following">' + Number(p.followingCount || 0) + '</b><span>Following</span></div>' +
        '</div></div>'
      );
    },

    profileEdit: function (u) {
      return (
        '<div class="card"><h3 style="margin:0 0 4px">Edit profile</h3>' +
        '<form data-form="edit-profile">' +
        '<label for="pf-name">Name</label><input id="pf-name" name="name" required maxlength="50" value="' + E(u.name || '') + '" />' +
        '<label for="pf-username">Username</label><input id="pf-username" name="username" required maxlength="20" pattern="[a-z0-9_]+" value="' + E(u.username || '') + '" />' +
        '<label for="pf-pic">Profile picture URL</label><input id="pf-pic" name="profilePicture" maxlength="500" value="' + E(u.profilePicture || '') + '" />' +
        '<label for="pf-bio">Bio</label><textarea id="pf-bio" name="bio" maxlength="200">' + E(u.bio || '') + '</textarea>' +
        '<button class="btn" style="margin-top:14px">Save changes</button>' +
        '</form></div>'
      );
    },
  };
})();
