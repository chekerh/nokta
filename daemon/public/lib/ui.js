(function () {
  'use strict';

  window.$ = function $(id) {
    return document.getElementById(id);
  };

  window.escHtml = function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  };

  // Set by index.html once its auth overlay exists. Kept as a hook so this module
  // does not depend on auth internals and other pages can leave it null.
  var onUnauthorized = null;
  window.setOnUnauthorized = function (fn) {
    onUnauthorized = fn;
  };

  // Optional: an async () => boolean|null|true that tries to refresh the access
  // token. A 401 is retried once after a successful refresh (true). A null
  // (transient failure) means the session is still alive; the original request
  // fails but the user is NOT logged out. Only a hard false ends the session.
  var onRefresh = null;
  window.setOnRefresh = function (fn) {
    onRefresh = fn;
  };

  window.api = async function api(method, path, body, retriedOnce) {
    var opts = { method: method, headers: {} };
    var token = localStorage.getItem('nokta-token') || localStorage.getItem('nokta_token');
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    var res = await fetch(window.location.origin + path, opts);
    if (res.status === 401 && token) {
      if (onRefresh && !retriedOnce) {
        var outcome = false;
        try {
          outcome = await onRefresh();
        } catch {
          outcome = null;
        }
        if (outcome === true) return api(method, path, body, true);
        if (outcome === null) {
          throw new Error('Could not refresh the session. Please try again.');
        }
        // Our refresh 401'd on a stale token: another tab may have rotated it
        // and won the race. Retry once with whatever access token is stored
        // now before deciding the session is dead.
        var latest = localStorage.getItem('nokta-token') || localStorage.getItem('nokta_token');
        if (latest && latest !== token) return api(method, path, body, true);
      }
      if (onUnauthorized) onUnauthorized();
      throw new Error('Session expired. Please sign in again.');
    }
    if (!res.ok) {
      var msg;
      try {
        var e = await res.json();
        msg = e.error || res.statusText;
      } catch {
        msg = res.statusText;
      }
      throw new Error(msg);
    }
    return res.headers.get('content-type') && res.headers.get('content-type').includes('json')
      ? res.json()
      : res.text();
  };
})();
