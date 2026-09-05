(function () {
  'use strict';

  let user = null;
  let liked = new Set();
  let followed = new Set();
  const posts = new Map();
  const comments = new Map();
  const editing = new Set();

  function likesKey() {
    return 'sm_likes_' + user.id;
  }
  function followsKey() {
    return 'sm_follows_' + user.id;
  }
  function persistSets() {
    localStorage.setItem(likesKey(), JSON.stringify(Array.from(liked)));
    localStorage.setItem(followsKey(), JSON.stringify(Array.from(followed)));
  }
  function loadSets() {
    try {
      liked = new Set(JSON.parse(localStorage.getItem(likesKey()) || '[]'));
      followed = new Set(JSON.parse(localStorage.getItem(followsKey()) || '[]'));
    } catch {
      liked = new Set();
      followed = new Set();
    }
  }

  window.Store = {
    isLoggedIn: function () {
      return !!user;
    },
    getUser: function () {
      return user;
    },
    hasToken: function () {
      return !!localStorage.getItem('sm_token');
    },
    login: function (token, u) {
      localStorage.setItem('sm_token', token);
      localStorage.setItem('sm_user', JSON.stringify(u));
      user = u;
      posts.clear();
      comments.clear();
      editing.clear();
      loadSets();
    },
    updateUser: function (u) {
      user = u;
      localStorage.setItem('sm_user', JSON.stringify(u));
    },
    logout: function () {
      localStorage.removeItem('sm_token');
      localStorage.removeItem('sm_user');
      user = null;
      liked = new Set();
      followed = new Set();
      posts.clear();
      comments.clear();
      editing.clear();
    },
    restoreUser: function () {
      try {
        return JSON.parse(localStorage.getItem('sm_user') || 'null');
      } catch {
        return null;
      }
    },
    likedHas: function (id) {
      return liked.has(String(id));
    },
    setLiked: function (id, on) {
      if (on) liked.add(String(id));
      else liked.delete(String(id));
      persistSets();
    },
    followedHas: function (id) {
      return followed.has(String(id));
    },
    setFollowed: function (id, on) {
      if (on) followed.add(String(id));
      else followed.delete(String(id));
      persistSets();
    },
    cachePost: function (p) {
      posts.set(String(p.id), p);
    },
    getPost: function (id) {
      return posts.get(String(id));
    },
    dropPost: function (id) {
      posts.delete(String(id));
      comments.delete(String(id));
    },
    commentsEntry: function (postId) {
      const key = String(postId);
      if (!comments.has(key)) comments.set(key, { open: false, loaded: false, list: [] });
      return comments.get(key);
    },
    isEditing: function (commentId) {
      return editing.has(String(commentId));
    },
    setEditing: function (commentId, on) {
      if (on) editing.add(String(commentId));
      else editing.delete(String(commentId));
    },
  };
})();
