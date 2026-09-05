(function () {
  'use strict';

  const TOKEN_KEY = 'sm_token';
  const USER_KEY = 'sm_user';

  class ApiError extends Error {
    constructor(status, message, data) {
      super(message || 'Request failed');
      this.status = status;
      this.data = data;
    }
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function saveSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function request(method, path, body) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    let res;
    try {
      res = await fetch(path, {
        method: method,
        headers: headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (networkErr) {
      throw new ApiError(0, 'Cannot reach the server. Check your connection.', null);
    }

    let data = null;
    try {
      data = await res.json();
    } catch {}

    if (!res.ok) {
      if (
        res.status === 401 &&
        token &&
        path.indexOf('/api/auth/') !== 0 &&
        typeof document !== 'undefined'
      ) {
        document.dispatchEvent(new CustomEvent('session-expired', { detail: data }));
      }
      throw new ApiError(res.status, (data && data.message) || 'Request failed', data);
    }
    return data;
  }

  window.API = {
    ApiError: ApiError,
    getToken: getToken,
    getStoredUser: getStoredUser,
    saveSession: saveSession,
    clearSession: clearSession,
    get: function (path) {
      return request('GET', path);
    },
    post: function (path, body) {
      return request('POST', path, body === undefined ? {} : body);
    },
    put: function (path, body) {
      return request('PUT', path, body === undefined ? {} : body);
    },
    del: function (path) {
      return request('DELETE', path);
    },
  };
})();
