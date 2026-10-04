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

  /* ---------- chat: work a problem with ask.php?chat ---------- */

  // The server keeps nothing between turns: the whole conversation is sent
  // each time and kept here. localStorage holds it only so a reload doesn't
  // lose a problem half-worked; it's per device on purpose, unlike the marks.
  var KEY_CHAT  = 'dmr.chat.v1';
  var chatBox   = document.getElementById('chat');
  var chatLog   = document.getElementById('chat-log');
  var chatForm  = document.getElementById('chat-form');
  var chatInput = document.getElementById('chat-input');
  var chatSend  = document.getElementById('chat-send');
  var chatStat  = document.getElementById('chat-status');
  var chatNew   = document.getElementById('chat-new');

  // file:// and standalone.html have no ask.php behind them, so the box stays
  // hidden there rather than failing on the first message.
  if (!chatBox || sync === 'local') return;
  addClass(root, 'chat-on');

  var convo = [];
  try { convo = JSON.parse(window.localStorage.getItem(KEY_CHAT)) || []; } catch (e) { convo = []; }
  if (!(convo instanceof Array)) convo = [];
  var waiting = false;

  function saveChat() {
    try { window.localStorage.setItem(KEY_CHAT, JSON.stringify(convo)); } catch (e) { /* in-memory only */ }
  }

  // Rule numbers as printed on the sheet ("4.8") -> the rule element.
  var byNum = {};
  each(rules, function (el) {
    var rn = el.getElementsByClassName('rn')[0];
    if (rn) byNum[rn.firstChild.nodeValue] = el;
  });

  // A copy of the rule, opened in place under the reply, so checking a rule
  // doesn't scroll you away from the problem. Shown in full even if it's
  // marked known, since you asked to read it.
  function toggleRule(link, el) {
    var open = link.openRule;
    if (open) { open.parentNode.removeChild(open); link.openRule = null; return; }
    var copy = el.cloneNode(true);
    copy.removeAttribute('id');
    var btn = copy.getElementsByTagName('button')[0];
    if (btn) btn.parentNode.removeChild(btn);
    removeClass(copy, 'known');
    var msg = link.parentNode;
    msg.appendChild(copy);
    link.openRule = copy;
  }

  // Plain text in, with "Rule 4.8" turned into a link wherever 4.8 exists.
  // Text nodes only -- a reply is never parsed as HTML.
  function fill(node, text) {
    var re = /Rule (\d+\.\d+)/g, last = 0, m;
    while ((m = re.exec(text))) {
      var el = byNum[m[1]];
      if (!el) continue;
      node.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = document.createElement('a');
      a.className = 'rlink';
      a.href = '#' + el.getAttribute('data-id');
      a.appendChild(document.createTextNode(m[0]));
      a.onclick = (function (a, el) {
        return function () { toggleRule(a, el); return false; };
      })(a, el);
      node.appendChild(a);
      last = m.index + m[0].length;
    }
    node.appendChild(document.createTextNode(text.slice(last)));
  }

  function addMsg(role, text) {
    var div = document.createElement('div');
    div.className = 'msg ' + (role === 'user' ? 'you' : 'tutor');
    var who = document.createElement('span');
    who.className = 'who';
    who.appendChild(document.createTextNode(role === 'user' ? 'You' : 'Tutor'));
    div.appendChild(who);
    fill(div, text);
    chatLog.appendChild(div);
    return div;
  }

  function status(text, isErr) {
    chatStat.firstChild.nodeValue = text || ' ';
    setClass(chatStat, 'err', !!isErr);
  }

  function renderChat() {
    while (chatLog.firstChild) chatLog.removeChild(chatLog.firstChild);
    each(convo, function (m) { addMsg(m.role, m.content); });
    chatNew.style.display = convo.length ? '' : 'none';
    chatInput.placeholder = convo.length ? 'Your next step, or a question' : 'e.g. 3(x - 2) = 12';
  }

  function sendChat() {
    var text = chatInput.value.replace(/^\s+|\s+$/g, '');
    if (!text || waiting) return;
    convo.push({ role: 'user', content: text });
    var mine = addMsg('user', text);
    chatInput.value = '';
    waiting = true;
    chatSend.disabled = true;
    chatNew.style.display = '';
    status('Thinking…');

    var xhr = new XMLHttpRequest();
    xhr.open('POST', 'ask.php?chat', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      waiting = false;
      chatSend.disabled = false;
      var data = null;
      if (xhr.status === 200) {
        try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
      }
      if (data && data.reply) {
        convo.push({ role: 'assistant', content: data.reply });
        saveChat();
        addMsg('assistant', data.reply).scrollIntoView(false);
        status('');
        return;
      }
      // Failed turn: take it back out so the conversation still alternates,
      // and give the text back to edit or resend.
      convo.pop();
      mine.parentNode.removeChild(mine);
      chatInput.value = text;
      var err = xhr.responseText || '';
      // The server's own errors are short plain text; anything else (a PHP
      // source dump, an HTML error page, nothing at all) isn't worth showing.
      status(xhr.status && xhr.status !== 200 && err.length < 400 && err.charAt(0) !== '<'
        ? err : 'Couldn\u2019t reach ask.php. Try again in a moment.', true);
    };
    try { xhr.send(JSON.stringify({ messages: convo })); }
    catch (e) {
      xhr.onreadystatechange = null;
      waiting = false;
      chatSend.disabled = false;
      convo.pop();
      mine.parentNode.removeChild(mine);
      chatInput.value = text;
      status('Couldn\u2019t send.', true);
    }
  }

  chatForm.onsubmit = function () { sendChat(); return false; };

  // Enter sends; Shift+Enter is a new line for a multi-line problem.
  chatInput.onkeydown = function (e) {
    e = e || window.event;
    if (e.keyCode === 13 && !e.shiftKey) { sendChat(); return false; }
  };

  chatNew.onclick = function () {
    if (waiting) return;
    convo = [];
    saveChat();
    renderChat();
    status('');
    chatInput.focus();
  };

  renderChat();
})();
