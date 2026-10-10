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

  window.api = async function api(method, path, body) {
    var opts = { method: method, headers: {} };
    var token = localStorage.getItem('nokta-token') || localStorage.getItem('nokta_token');
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    var res = await fetch(window.location.origin + path, opts);
    if (res.status === 401 && token) {
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
