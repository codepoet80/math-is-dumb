/* sheet.js — "I already know this" state, shared across devices.
 *
 * ES5 only, no libraries, no DOM APIs newer than WebKit 534 (webOS 3.0.5 /
 * TouchPad). That rules out: let/const, arrows, classList, dataset,
 * NodeList.forEach, Element.matches, Array.from, fetch, Promise. Everything
 * below is on purpose — see README before "modernising" it.
 *
 * The server (state.php, one JSON file in data/) is the source of truth, so
 * a rule marked on the phone is marked on the TouchPad too. localStorage
 * (cookie fallback) is only a cache: it paints the page instantly and keeps
 * things working when there is no server — standalone.html, file://, or the
 * LAN server without PHP. Every change is sent as a delta, not the whole
 * state, so two devices can never overwrite each other's marks.
 */
(function () {
  'use strict';

  var KEY_KNOWN = 'dmr.known.v1';
  var KEY_HIDE  = 'dmr.hide.v1';
  var ENDPOINT  = 'state.php';   // relative: the sheet may live under /math/

  /* ---------- storage ---------- */

  function read(key) {
    try {
      var v = window.localStorage.getItem(key);
      if (v !== null && v !== undefined) return v;
    } catch (e) { /* fall through to cookie */ }
    var m = document.cookie.match(
      new RegExp('(?:^|; )' + key.replace(/\./g, '\\.') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch (e) { /* fall through to cookie */ }
    document.cookie = key + '=' + encodeURIComponent(value) +
      ';path=/;max-age=31536000';
  }

  /* ---------- tiny DOM helpers (no classList in WebKit 534) ---------- */

  function each(list, fn) {
    for (var i = 0; i < list.length; i++) fn(list[i], i);
  }

  function hasClass(el, c) {
    return (' ' + el.className + ' ').indexOf(' ' + c + ' ') > -1;
  }

  function addClass(el, c) {
    if (!hasClass(el, c)) el.className = el.className ? el.className + ' ' + c : c;
  }

  function removeClass(el, c) {
    var parts = el.className.split(/\s+/), out = [], i;
    for (i = 0; i < parts.length; i++) if (parts[i] && parts[i] !== c) out.push(parts[i]);
    el.className = out.join(' ');
  }

  function setClass(el, c, on) { (on ? addClass : removeClass)(el, c); }

  /* ---------- state ---------- */

  var known = {};
  var raw = read(KEY_KNOWN);
  if (raw) {
    try { known = JSON.parse(raw) || {}; } catch (e) { known = {}; }
  }
  var hiding = read(KEY_HIDE) === '1';

  function persist() {
    write(KEY_KNOWN, JSON.stringify(known));
    write(KEY_HIDE, hiding ? '1' : '0');
  }

  /* ---------- server sync ---------- */

  // 'local'   file:// or similar — never try the server, never mention it
  // 'pending' first fetch in flight
  // 'ok'      server reachable; it owns the state
  // 'off'     server unreachable; this device is on its own
  var sync = /^https?:$/.test(window.location.protocol) ? 'pending' : 'local';
  var lastFetch = 0;

  function request(method, body, done) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, ENDPOINT, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var data = null;
      if (xhr.status === 200) {
        try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
      }
      // A non-PHP host hands back the PHP source with a 200 -- JSON.parse
      // fails on it, which is exactly the "no server" case we want.
      done(data && data.known ? data : null);
    };
    if (body) xhr.setRequestHeader('Content-Type', 'application/json');
    try { xhr.send(body ? JSON.stringify(body) : null); }
    catch (e) { done(null); }
  }

  // The server's answer always replaces local state. persist() keeps the
  // cache honest so the next page load paints the right thing before the
  // fetch returns.
  function adopt(data) {
    known  = data.known || {};
    hiding = !!data.hide;
    persist();
    render();
  }

  function pull() {
    if (sync === 'local') return;
    lastFetch = +new Date();
    request('GET', null, function (data) {
      if (data) { sync = 'ok'; adopt(data); }
      else { sync = 'off'; render(); }
    });
  }

  function push(delta) {
    if (sync !== 'ok') return;
    request('POST', delta, function (data) {
      if (data) adopt(data); else { sync = 'off'; render(); }
    });
  }

  /* ---------- wiring ---------- */

  var root     = document.documentElement;
  var rules    = document.getElementsByClassName('rule');
  var sections = document.getElementsByClassName('section');
  var hideBox  = document.getElementById('hide-known');
  var tally    = document.getElementById('tally');
  var resetBtn = document.getElementById('reset-known');

  /* The arrow itself is a CSS border triangle flipped by the .known class --
     webOS 3.0.5 has no glyph for U+25B4/U+25BE, and a border triangle needs no
     font coverage at all. So this only has to keep the labels honest. */
  function label(el, isKnown) {
    var btn = el.getElementsByTagName('button')[0];
    if (!btn) return;
    var text = isKnown ? 'Bring this rule back' : 'I already know this \u2014 collapse it';
    btn.setAttribute('aria-pressed', isKnown ? 'true' : 'false');
    btn.setAttribute('aria-label', text);
    btn.setAttribute('title', text);
  }

  function render() {
    var total = 0, count = 0;

    each(sections, function (sec) {
      var inSec = sec.getElementsByClassName('rule');
      var secKnown = 0;

      each(inSec, function (el) {
        var isKnown = !!known[el.getAttribute('data-id')];
        setClass(el, 'known', isKnown);
        label(el, isKnown);
        total++;
        if (isKnown) { count++; secKnown++; }
      });

      var badge = sec.getElementsByClassName('scount')[0];
      if (badge) {
        badge.firstChild.nodeValue = secKnown ? secKnown + '/' + inSec.length : '';
      }

      // a section whose rules are all known collapses entirely in hide mode
      var empty = hiding && inSec.length > 0 && secKnown === inSec.length;
      setClass(sec, 'all-known', empty);

      var link = document.getElementById('toc-' + sec.id);
      if (link) setClass(link, 'muted', empty);
    });

    setClass(root, 'hiding', hiding);
    if (hideBox) hideBox.checked = hiding;

    if (tally) {
      var text = count === 0
        ? 'Nothing marked yet \u2014 tap the arrow on any rule you already know.'
        : count + ' of ' + total + ' marked · ' + (total - count) + ' still to learn';
      if (sync === 'off') text += ' · not synced';
      tally.firstChild.nodeValue = text;
    }
    if (resetBtn) resetBtn.style.display = count ? '' : 'none';
  }

  each(rules, function (el) {
    var btn = el.getElementsByTagName('button')[0];
    if (!btn) return;
    btn.onclick = function () {
      var id = el.getAttribute('data-id'), delta = {};
      if (known[id]) { delete known[id]; } else { known[id] = 1; }
      persist();
      render();
      delta[id] = known[id] ? 1 : 0;
      push({ set: delta });
    };
  });

  if (hideBox) {
    hideBox.onchange = function () {
      hiding = hideBox.checked;
      persist();
      render();
      push({ hide: hiding });
    };
  }

  if (resetBtn) {
    resetBtn.onclick = function () {
      var where = sync === 'ok' ? 'on every device' : 'on this device';
      if (!window.confirm('Unmark all rules ' + where + '?')) return;
      known = {};
      persist();
      render();
      push({ reset: true });
    };
  }

  render();   // paint from the cache immediately...
  pull();     // ...then let the server correct it

  // Coming back to a tab that has been open for a while: another device may
  // have marked things since. Cheap to check, throttled so a focus flurry
  // doesn't hammer the server.
  window.onfocus = function () {
    if (sync === 'ok' && +new Date() - lastFetch > 5000) pull();
  };
})();
