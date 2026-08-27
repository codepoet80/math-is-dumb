/* sheet.js — per-device "I already know this" state.
 *
 * ES5 only, no libraries, no DOM APIs newer than WebKit 534 (webOS 3.0.5 /
 * TouchPad). That rules out: let/const, arrows, classList, dataset,
 * NodeList.forEach, Element.matches, Array.from. Everything below is on
 * purpose — see README before "modernising" it.
 *
 * State lives in localStorage, falling back to a cookie when storage throws
 * (Safari private browsing, webOS with site data off). Both are per-device,
 * which is what we want: what you know on the phone isn't what you know on
 * paper.
 */
(function () {
  'use strict';

  var KEY_KNOWN = 'dmr.known.v1';
  var KEY_HIDE  = 'dmr.hide.v1';

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
      tally.firstChild.nodeValue = count === 0
        ? 'Nothing marked yet \u2014 tap the arrow on any rule you already know.'
        : count + ' of ' + total + ' marked · ' + (total - count) + ' still to learn';
    }
    if (resetBtn) resetBtn.style.display = count ? '' : 'none';
  }

  each(rules, function (el) {
    var btn = el.getElementsByTagName('button')[0];
    if (!btn) return;
    btn.onclick = function () {
      var id = el.getAttribute('data-id');
      if (known[id]) { delete known[id]; } else { known[id] = 1; }
      persist();
      render();
    };
  });

  if (hideBox) {
    hideBox.onchange = function () { hiding = hideBox.checked; persist(); render(); };
  }

  if (resetBtn) {
    resetBtn.onclick = function () {
      if (!window.confirm('Unmark all rules on this device?')) return;
      known = {};
      persist();
      render();
    };
  }

  render();
})();
