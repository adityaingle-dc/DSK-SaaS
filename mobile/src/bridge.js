// Script injected into the portal page before it loads. It routes the browser features a WebView can't do
// on its own to the native app through window.ReactNativeWebView.postMessage:
//   window.print()            → { type: 'print', html, title }   (report → Android print / Save as PDF)
//   blob download (<a download>) → { type: 'file', name, mime, base64, share: true }   (e.g. activity CSV)
//   window.open(blob / '')    → { type: 'file', ... }   (open an attached photo / PDF)
//   window.open(https://…)    → { type: 'external', url }   (WhatsApp, Google Maps … in their apps)
//   navigator.geolocation      → asks the app for location permission first ({ type: 'location' })
export const BRIDGE = `
(function () {
  if (window.__dskBridge) return;
  window.__dskBridge = true;
  var post = function (msg) { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); };

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }
  function sendBlobUrl(url, name, share) {
    return fetch(url).then(function (res) { return res.blob(); }).then(function (blob) {
      return blobToBase64(blob).then(function (b64) {
        post({ type: 'file', name: name || 'file', mime: blob.type || 'application/octet-stream', base64: b64, share: !!share });
      });
    }).catch(function (e) { post({ type: 'error', message: 'Could not open the file: ' + e.message }); });
  }
  function handleUrl(url, name) {
    if (!url) return;
    if (url.indexOf('blob:') === 0 || url.indexOf('data:') === 0) return sendBlobUrl(url, name, false);
    post({ type: 'external', url: url });
  }

  // downloads made with <a href="blob:…" download="name">
  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute('download') && /^(blob|data):/.test(this.href)) {
      return sendBlobUrl(this.href, this.getAttribute('download') || 'download', true);
    }
    return origClick.apply(this, arguments);
  };

  // window.open: the portal opens files (blob URLs) and WhatsApp / Maps links in new tabs
  window.open = function (url) {
    if (url) { handleUrl(String(url)); return null; }
    // window.open('') then w.location.href = blobUrl (attachments)
    var fake = { closed: false, close: function () { this.closed = true; }, focus: function () {} };
    fake.location = {};
    Object.defineProperty(fake.location, 'href', { set: function (u) { handleUrl(String(u)); } });
    return fake;
  };

  // print: inline styles and images so the HTML prints the same outside the page
  function toDataUrl(img) {
    return new Promise(function (resolve) {
      if (!/^blob:/.test(img.src)) return resolve(img.src);
      fetch(img.src).then(function (r) { return r.blob(); }).then(blobToBase64).then(function (b64) {
        resolve('data:image/jpeg;base64,' + b64);
      }).catch(function () { resolve(img.src); });
    });
  }
  window.print = function () {
    var imgs = Array.prototype.slice.call(document.images);
    Promise.all(imgs.map(toDataUrl)).then(function (srcs) {
      var clone = document.documentElement.cloneNode(true);
      var cImgs = clone.querySelectorAll('img');
      srcs.forEach(function (s, i) { if (cImgs[i]) cImgs[i].setAttribute('src', s); });
      var css = '';
      Array.prototype.forEach.call(document.styleSheets, function (sheet) {
        try { Array.prototype.forEach.call(sheet.cssRules, function (r) { css += r.cssText + '\\n'; }); } catch (e) { /* cross-origin sheet */ }
      });
      Array.prototype.forEach.call(clone.querySelectorAll('link[rel="stylesheet"], style, script'), function (n) { n.remove(); });
      var head = clone.querySelector('head');
      var style = document.createElement('style');
      style.textContent = css;
      head.appendChild(style);
      var base = document.createElement('base');
      base.href = location.origin + '/';
      head.insertBefore(base, head.firstChild);
      post({ type: 'print', title: document.title, html: '<!doctype html>' + clone.outerHTML });
    });
  };

  // location: make sure the app has permission before the page asks for a fix
  if (navigator.geolocation) {
    var geo = navigator.geolocation;
    var pending = [];
    window.__dskLocation = function (granted) {
      var list = pending; pending = [];
      list.forEach(function (fn) { fn(granted); });
    };
    ['getCurrentPosition', 'watchPosition'].forEach(function (name) {
      var orig = geo[name].bind(geo);
      geo[name] = function (ok, fail, opts) {
        pending.push(function (granted) {
          if (granted) orig(ok, fail, opts);
          else if (fail) fail({ code: 1, message: 'Location permission denied. Allow it in Android Settings → Apps → DSKRISHNA.' });
        });
        post({ type: 'location' });
        return 0;
      };
    });
  }
})();
true;
`;
