(function () {
  'use strict';

  function q(sel, root) {
    return (root || document).querySelector(sel);
  }
  function postsListEl() {
    return document.getElementById('posts-list');
  }

  function renderCommentsInto(card) {
    const postId = card.dataset.postId;
    const entry = Store.commentsEntry(postId);
    const box = q('[data-comments]', card);
    if (!entry.open) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.hidden = false;
    if (!entry.loaded) {
      box.innerHTML = UI.spinnerHtml();
      API.get('/api/posts/' + encodeURIComponent(postId) + '/comments')
        .then(function (r) {
          entry.list = r.comments;
          entry.loaded = true;
          renderCommentsInto(card);
          updateCommentCount(card);
        })
        .catch(function (err) {
          box.innerHTML = UI.emptyStateHtml(err.message || 'Could not load comments');
        });
      return;
    }
    box.innerHTML = TPL.commentsArea(postId);
  }

  function updateCommentCount(card) {
    const entry = Store.commentsEntry(card.dataset.postId);
    const badge = q('[data-c-count]', card);
    if (badge && entry.loaded) badge.textContent = String(entry.list.length);
  }

  function renderFeed() {
    Ctx.showView('feed');
    q('#composer-slot').innerHTML = TPL.composer();
    postsListEl().innerHTML = UI.spinnerHtml();
    q('#side-panel').innerHTML = UI.spinnerHtml();
    loadPosts();
    loadSidebarSuggestions();
  }

  function loadPosts() {
    API.get('/api/posts?limit=50')
      .then(function (r) {
        Store.getUser() && renderPostList(r.posts);
      })
      .catch(function (err) {
        if (!Store.isLoggedIn()) return;
        postsListEl().innerHTML =
          '<div class="empty-state">' + UI.escapeHtml(err.message || 'Could not load the feed.') +
          ' <div style="margin-top:10px"><button type="button" class="btn btn-ghost btn-sm" data-action="retry-feed">Retry</button></div></div>';
      });
  }

  function renderPostList(list) {
    list.forEach(Store.cachePost);
    postsListEl().innerHTML = list.length
      ? list.map(TPL.postCard.bind(null)).join('')
      : UI.emptyStateHtml('No posts yet — be the first to share something!');
  }

  function loadSidebarSuggestions() {
    API.get('/api/users/suggestions')
      .then(function (r) {
        const panel = q('#side-panel');
        if (!panel || !Store.isLoggedIn()) return;
        panel.innerHTML =
          '<div class="card"><h3 style="margin:0 0 10px">Suggested users</h3>' +
          (r.users.length
            ? r.users.slice(0, 5).map(function (u) { return TPL.userRow(u, Store.followedHas(u.id)); }).join('')
            : UI.emptyStateHtml('No suggestions right now.')) +
          '<a href="#/suggestions" style="display:block;margin-top:10px;font-size:.85rem">See all →</a></div>';
      })
      .catch(function () {});
  }

  function renderSuggestions() {
    Ctx.showView('suggestions');
    const grid = document.getElementById('suggestions-grid');
    grid.innerHTML = UI.spinnerHtml();
    API.get('/api/users/suggestions')
      .then(function (r) {
        grid.innerHTML = r.users.length
          ? '<div class="user-grid">' + r.users.map(function (u) { return TPL.userRow(u, Store.followedHas(u.id)); }).join('') + '</div>'
          : UI.emptyStateHtml('No other users to suggest yet.');
      })
      .catch(function (err) {
        grid.innerHTML = UI.emptyStateHtml(err.message || 'Could not load suggestions.');
      });
  }

  function handleLike(btn) {
    const card = btn.closest('[data-post-id]');
    const postId = card.dataset.postId;
    const liked = Store.likedHas(postId);
    UI.setBusy(btn, true);
    const req = liked ? API.del('/api/posts/' + postId + '/like') : API.post('/api/posts/' + postId + '/like');
    req
      .then(function (res) {
        Store.setLiked(postId, !liked);
        applyLikeState(card, res.likesCount, !liked);
      })
      .catch(function (err) {
        if (err.status === 409) {
          const serverLiked = /already liked/i.test(err.message || '');
          Store.setLiked(postId, serverLiked);
          API.get('/api/posts/' + postId)
            .then(function (r) {
              applyLikeState(card, r.post.likesCount, serverLiked);
              UI.toast('Synced with latest like state', 'info');
            })
            .catch(function () {});
          return;
        }
        UI.toast(err.message || 'Could not update like', 'error');
      })
      .finally(function () {
        UI.setBusy(btn, false);
      });
  }

  function applyLikeState(card, likesCount, liked) {
    q('[data-count]', card).textContent = String(likesCount);
    const btn = q('[data-action="like"]', card);
    btn.textContent = liked ? 'Unlike' : 'Like';
    // Keep the pending busy-restore in sync with the NEW state, otherwise
    // .finally(setBusy(false)) would clobber it with the stale pre-click label
    btn.dataset.label = btn.textContent;
    btn.classList.toggle('liked', liked);
  }

  function addComment(form) {
    const input = form.elements.content;
    const content = input.value.trim();
    if (!content) return;
    const card = form.closest('[data-post-id]');
    const postId = card.dataset.postId;
    UI.setBusy(q('button', form), true);
    API.post('/api/posts/' + postId + '/comments', { content: content })
      .then(function (r) {
        const entry = Store.commentsEntry(postId);
        entry.list.unshift(r.comment);
        entry.open = true;
        entry.loaded = true;
        input.value = '';
        renderCommentsInto(card);
        updateCommentCount(card);
        UI.toast('Comment added');
      })
      .catch(function (err) {
        UI.toast(err.message || 'Could not add comment', 'error');
      })
      .finally(function () {
        UI.setBusy(q('button', form), false);
      });
  }

  function saveCommentEdit(form) {
    const commentId = form.dataset.commentId;
    const content = form.elements.content.value.trim();
    if (!content) return;
    API.put('/api/comments/' + commentId, { content: content })
      .then(function (r) {
        Store.setEditing(commentId, false);
        refreshVisibleComments(commentId, r.comment);
        UI.toast('Comment updated');
      })
      .catch(function (err) {
        UI.toast(err.message || 'Could not update comment', 'error');
      });
  }

  function refreshVisibleComments(commentId, updated) {
    document.querySelectorAll('[data-comments]').forEach(function (box) {
      const card = box.closest('[data-post-id]');
      const entry = Store.commentsEntry(card.dataset.postId);
      const idx = entry.list.findIndex(function (c) { return String(c.id) === String(commentId); });
      if (idx !== -1) {
        entry.list[idx] = updated;
        renderCommentsInto(card);
      }
    });
  }

  window.Feed = {
    renderFeed: renderFeed,
    renderSuggestions: renderSuggestions,
    act: function (action, btn) {
      const card = btn.closest('[data-post-id]');
      switch (action) {
        case 'like':
          handleLike(btn);
          break;
        case 'toggle-comments': {
          const entry = Store.commentsEntry(card.dataset.postId);
          entry.open = !entry.open;
          renderCommentsInto(card);
          break;
        }
        case 'start-comment-edit': {
          const cid = btn.closest('[data-comment-id]').dataset.commentId;
          Store.setEditing(cid, true);
          renderCommentsInto(card);
          break;
        }
        case 'cancel-comment-edit': {
          const cid = btn.closest('[data-form]').dataset.commentId;
          Store.setEditing(cid, false);
          renderCommentsInto(card);
          break;
        }
        case 'delete-comment': {
          const item = btn.closest('[data-comment-id]');
          const cid = item.dataset.commentId;
          if (!confirm('Delete this comment?')) return;
          API.del('/api/comments/' + cid)
            .then(function () {
              const pid = card.dataset.postId;
              const entry = Store.commentsEntry(pid);
              entry.list = entry.list.filter(function (c) { return String(c.id) !== String(cid); });
              renderCommentsInto(card);
              updateCommentCount(card);
              UI.toast('Comment deleted');
            })
            .catch(function (err) {
              UI.toast(err.message || 'Could not delete comment', 'error');
            });
          break;
        }
        case 'start-post-edit': {
          const p = Store.getPost(card.dataset.postId);
          q('.post-body', card).innerHTML =
            '<form data-form="save-post-edit" data-post-id="' + UI.escapeHtml(p.id) + '">' +
            '<textarea name="content" maxlength="2000" required>' + UI.escapeHtml(p.content) + '</textarea>' +
            '<input name="imageUrl" maxlength="500" placeholder="Optional image URL" style="margin-top:8px" value="' + UI.escapeHtml(p.imageUrl || '') + '" />' +
            '<div class="edit-actions" style="margin-top:8px">' +
            '<button class="btn btn-sm">Save</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-action="cancel-post-edit">Cancel</button></div></form>';
          break;
        }
        case 'cancel-post-edit': {
          const p = Store.getPost(card.dataset.postId);
          if (p) {
            const tmp = document.createElement('div');
            tmp.innerHTML = TPL.postCard(p);
            card.replaceWith(tmp.firstElementChild);
          }
          break;
        }
        case 'delete-post': {
          if (!confirm('Delete this post?')) return;
          const pid = card.dataset.postId;
          API.del('/api/posts/' + pid)
            .then(function () {
              Store.dropPost(pid);
              card.remove();
              UI.toast('Post deleted');
            })
            .catch(function (err) {
              UI.toast(err.message || 'Could not delete post', 'error');
            });
          break;
        }
        case 'retry-feed':
          renderFeed();
          break;
      }
    },
    submit: function (form) {
      switch (form.dataset.form) {
        case 'composer': {
          const content = form.elements.content.value.trim();
          const imageUrl = form.elements.imageUrl.value.trim();
          if (!content) return;
          const btn = q('button', form);
          UI.setBusy(btn, true);
          API.post('/api/posts', { content: content, imageUrl: imageUrl || undefined })
            .then(function (r) {
              Store.cachePost(r.post);
              postsListEl().insertAdjacentHTML('afterbegin', TPL.postCard(r.post));
              form.reset();
              UI.toast('Posted!');
            })
            .catch(function (err) {
              UI.toast(err.message || 'Could not create post', 'error');
            })
            .finally(function () {
              UI.setBusy(btn, false);
            });
          break;
        }
        case 'add-comment':
          addComment(form);
          break;
        case 'save-post-edit': {
          const postId = form.dataset.postId;
          const content = form.elements.content.value.trim();
          const imageUrl = form.elements.imageUrl.value.trim();
          if (!content) return;
          API.put('/api/posts/' + postId, { content: content, imageUrl: imageUrl || '' })
            .then(function (r) {
              Store.cachePost(r.post);
              const card = q('[data-post-id="' + postId + '"]');
              if (card) {
                const tmp = document.createElement('div');
                tmp.innerHTML = TPL.postCard(r.post);
                card.replaceWith(tmp.firstElementChild);
              }
              UI.toast('Post updated');
            })
            .catch(function (err) {
              UI.toast(err.message || 'Could not update post', 'error');
            });
          break;
        }
        case 'save-comment-edit':
          saveCommentEdit(form);
          break;
      }
    },
  };
})();
