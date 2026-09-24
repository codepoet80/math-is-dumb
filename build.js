#!/usr/bin/env node
/* build.js — renders content/rules.json into static HTML.
 *
 * Static on purpose: the sheet itself needs no request-time code and no JS.
 * The same file prints correctly, serves from any host, and opens on the
 * TouchPad browser. The one server-side piece, state.php, is an enhancement
 * the page works without.
 *
 *   node build.js
 *
 * Output lands in the repo root, because the repo root IS the webroot: syncing
 * the repo to the server is the whole deploy. assets/ is served straight from
 * source — nothing is copied or duplicated.
 *
 *   index.html            — the sheet (commit this; it is generated, not authored)
 *   standalone.html       — CSS+JS inlined, one file (offline / sideload / email)
 *   build/artifact.html   — body fragment for Claude Code's Artifact publisher
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/rules.json'), 'utf8'));
const css  = fs.readFileSync(path.join(ROOT, 'assets/sheet.css'), 'utf8');
const js   = fs.readFileSync(path.join(ROOT, 'assets/sheet.js'), 'utf8');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Superscripts are real <sup> markup, never Unicode superscript characters:
// U+1D43 and friends have no glyph on webOS 3.0.5 and render as tofu, while
// <sup> is as old as HTML and needs no font coverage beyond plain ASCII.
//   x^2        -> x<sup>2</sup>       (single alphanumeric, optionally signed)
//   x^{a+b}    -> x<sup>a+b</sup>     (braces for anything longer)
//   x_1        -> x<sub>1</sub>       (same syntax, same reason)
const sup = t => t
  .replace(/\^\{([^}]*)\}/g, '<sup>$1</sup>')
  .replace(/\^(-?[A-Za-z0-9]+)/g, '<sup>$1</sup>')
  .replace(/_\{([^}]*)\}/g, '<sub>$1</sub>')
  .replace(/_(-?[A-Za-z0-9]+)/g, '<sub>$1</sub>');

// Math in `code` is set the way a textbook sets it, because `1/(^3√125)^2` on one
// line is exactly the notation that's hard to read while learning it:
//   a/b, a / b   -> stacked fraction (the spaced form too: rise / run)
//   √x, √(a+b)   -> a bar over everything under the root; the parens it replaces go
//   ^3√x         -> the 3 sits in the crook of the radical
//   (x+1)/(x−1)  -> parens that only group a numerator or denominator are dropped
// Fractions inside an exponent (x^{2/3}) stay inline: stacked at superscript size
// they're unreadable, and textbooks don't do it either. It's a tiny parser for
// what the sheet actually writes, not a TeX engine: words, (groups), √, ^, _, /.
function math(src) {
  let i = 0;
  const isWord = c => /[A-Za-z0-9.]/.test(c);

  // A script after ^ or _: {anything} or a signed alphanumeric run, as in sup().
  function script() {
    if (src[i] === '{') {
      const end = src.indexOf('}', i);
      const body = src.slice(i + 1, end);
      i = end + 1;
      return body;
    }
    const m = /^-?[A-Za-z0-9]+/.exec(src.slice(i));
    i += m ? m[0].length : 0;
    return m ? m[0] : '';
  }
  function scripts(node) {
    while (src[i] === '^' || src[i] === '_') {
      if (src[i] === '^' && /^\^[A-Za-z0-9]+√/.test(src.slice(i))) break;  // ^3√ is a root index
      const kind = src[i++] === '^' ? 'sup' : 'sub';
      node[kind] = (node[kind] || '') + script();
    }
    return node;
  }
  function atom() {
    const c = src[i];
    const idx = /^\^([A-Za-z0-9]+)√/.exec(src.slice(i));
    if (idx || c === '√') {
      i += idx ? idx[0].length : 1;
      return scripts({ t: 'rad', idx: idx && idx[1], body: atom() });
    }
    if (c === '(') {
      i++;
      const kids = seq(')');
      i++;
      return scripts({ t: 'group', kids });
    }
    if (isWord(c)) {
      let s = '';
      while (i < src.length && isWord(src[i])) s += src[i++];
      return scripts({ t: 'word', s });
    }
    i++;
    return { t: 'text', s: c };
  }
  function seq(stop) {
    const out = [];
    while (i < src.length && src[i] !== stop) out.push(atom());
    return fractions(out);
  }
  // a/b and a / b: the atoms either side of a slash become a stacked fraction.
  function fractions(nodes) {
    const out = [];
    for (let k = 0; k < nodes.length; k++) {
      const n = nodes[k];
      if (!(n.t === 'text' && n.s === '/')) { out.push(n); continue; }
      const spaced = out.length && out[out.length - 1].s === ' ' && nodes[k + 1] && nodes[k + 1].s === ' ';
      if (spaced) out.pop();
      const left = out[out.length - 1];
      const right = nodes[k + 1 + (spaced ? 1 : 0)];
      if (!left || left.t === 'text' || !right || right.t === 'text') {
        if (spaced) out.push({ t: 'text', s: ' ' });
        out.push(n);
        continue;
      }
      out[out.length - 1] = { t: 'frac', num: left, den: right };
      k += spaced ? 2 : 1;
    }
    return out;
  }

  const scriptsHtml = n =>
    (n.sub ? `<sub>${inline(n.sub)}</sub>` : '') + (n.sup ? `<sup>${inline(n.sup)}</sup>` : '');
  // bare: drop a group's parens when a bar or fraction line already shows its extent.
  function html(n, bare) {
    switch (n.t) {
      case 'text':  return esc(n.s);
      case 'word':  return esc(n.s) + scriptsHtml(n);
      case 'group': return bare && !n.sup && !n.sub
        ? n.kids.map(k => html(k)).join('')
        : '(' + n.kids.map(k => html(k)).join('') + ')' + scriptsHtml(n);
      case 'rad':   return `<span class="rad">${n.idx ? `<sup class="ri">${esc(n.idx)}</sup>` : ''}√` +
        `<span class="rc">${html(n.body, true)}</span></span>` + scriptsHtml(n);
      case 'frac':  return `<span class="frac"><span class="fn">${html(n.num, true)}</span>` +
        `<span class="fd">${html(n.den, true)}</span></span>`;
    }
  }
  return seq().map(n => html(n)).join('');
}
// Exponent contents: same markup, but fractions stay inline.
const inline = s => esc(s).replace(/\^([A-Za-z0-9]+)√/g, '<sup>$1</sup>√');

// inline markup: x^2, x_1, #{section-id}, `code`, **bold**, *emphasis*. Code spans are
// set aside first, so emphasis can never reach inside math. Bold runs before the
// single-asterisk pass so emphasis only ever sees genuine emphasis.
const md = s => {
  const codes = [];
  const rest = String(s).replace(/`([^`]+)`/g, (_, c) => '\u0000' + (codes.push(math(c)) - 1) + '\u0000');
  return xref(sup(esc(rest)))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${codes[n]}</code>`);
};

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pad  = n => String(n).padStart(2, '0');

// Content refers to other sections as #{section-id}; the number is resolved at
// build time so reordering sections can never leave a stale "see 06" behind.
const sectionNumbers = {};
data.sections.forEach((s, i) => { sectionNumbers[s.id || slug(s.title)] = pad(i + 1); });

const xref = t => t.replace(/#\{([a-z0-9-]+)\}/g, (_, id) => {
  if (!(id in sectionNumbers)) throw new Error('cross-reference to unknown section: ' + id);
  return sectionNumbers[id];
});

const FIELDS = [
  ['why',      'Why'],
  ['when',     'When'],
  ['trap',     'Trap'],
  ['example',  'Ex.'],
  ['mnemonic', 'Hook'],
];

// Rules are numbered section.position ("4.8") so a rule found some other way,
// like ask.php in a terminal, can be looked up on the sheet. Like section numbers,
// they come from array order at build time; ask.php numbers the same way. The
// element id is the stable rule id, so ask.php can also link straight to it.
function renderRule(r, num) {
  const rows = FIELDS
    .filter(([key]) => r[key])
    .map(([key, label]) => `          <dt>${label}</dt><dd class="${key}">${md(r[key])}</dd>`)
    .join('\n');
  const flag = r.star ? '<span class="flag">load-bearing</span>' : '';
  if (!r.id) throw new Error('rule is missing a stable id: ' + r.rule);
  return `        <div class="rule${r.star ? ' star' : ''}" id="${esc(r.id)}" data-id="${esc(r.id)}">
          <button class="know" type="button" aria-pressed="false" aria-label="Collapse this rule"><span class="tri"></span></button>
          <p class="r"><span class="rn">${num}</span>${md(r.rule)}${flag}</p>
          <dl>
${rows}
          </dl>
        </div>`;
}

function renderSection(s, i) {
  const id = s.id || slug(s.title);
  const [first, ...rest] = s.rules;
  // The heading, blurb and first rule are wrapped in one box so they physically
  // cannot be separated by a column or page break. `break-after: avoid` would be
  // the tidy way to say this, but WebKit largely ignores it -- and Safari is what
  // actually prints this sheet. `break-inside: avoid` on a real box is honoured
  // everywhere, so the keep-together group has to BE a box.
  return `      <section class="section" id="${esc(id)}">
        <div class="sechead">
          <h2><span class="n">${pad(i + 1)}</span>${md(s.title)}<span class="scount"> </span></h2>
          ${s.blurb ? `<p class="blurb">${md(s.blurb)}</p>` : ''}
${renderRule(first, `${i + 1}.1`)}
        </div>
${rest.map((r, j) => renderRule(r, `${i + 1}.${j + 2}`)).join('\n')}
      </section>`;
}

const allIds = data.sections.flatMap(s => s.rules.map(r => r.id));
const dupes = allIds.filter((id, i) => allIds.indexOf(id) !== i);
if (dupes.length) throw new Error('duplicate rule ids: ' + [...new Set(dupes)].join(', '));

const ruleCount = data.sections.reduce((n, s) => n + s.rules.length, 0);
const starCount = data.sections.reduce((n, s) => n + s.rules.filter(r => r.star).length, 0);
const rev = new Date().toISOString().slice(0, 10);

const toc = data.sections
  .map((s, i) => `        <li><a id="toc-${esc(s.id || slug(s.title))}" href="#${esc(s.id || slug(s.title))}"><span class="n">${pad(i + 1)}</span>${esc(s.title)}</a></li>`)
  .join('\n');

const body = `  <div class="wrap">
    <header class="masthead">
      <div>
        <h1>${esc(data.title)}</h1>
        <p class="sub">${esc(data.subtitle)}</p>
      </div>
      <div class="stamp">
        Rev. ${rev}<br>
        ${ruleCount} rules &middot; ${data.sections.length} sections<br>
        Prints to letter, 2 col.
      </div>
    </header>

    <ul class="toc">
${toc}
    </ul>

    <div class="controls">
      <label for="hide-known"><input type="checkbox" id="hide-known"> Hide what I know</label>
      <span class="tally" id="tally"> </span>
      <button type="button" class="linkish" id="reset-known">Reset</button>
    </div>

    <div class="columns">
${data.sections.map(renderSection).join('\n\n')}
    </div>
  </div>`;

const FONTS = '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
  + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
  + 'family=Archivo+Narrow:wght@600;700&'
  + 'family=IBM+Plex+Mono:wght@400&'
  + 'family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap">';

const page = (head, tail) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(data.title)}</title>
${FONTS}
${head}
<script>document.documentElement.className += ' js';</script>
</head>
<body>
${body}
${tail}
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, 'index.html'), page(
  '<link rel="stylesheet" href="assets/sheet.css">',
  '<script src="assets/sheet.js"></script>'));

fs.writeFileSync(path.join(ROOT, 'standalone.html'), page(
  '<style>\n' + css + '\n</style>',
  '<script>\n' + js + '\n</script>'));

// Artifact publisher supplies its own <!doctype>/<head>/<body>, so emit a fragment.
fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'build/artifact.html'),
  `<title>${esc(data.title)}</title>\n${FONTS}\n<style>\n${css}\n</style>\n`
  + `<script>document.documentElement.className += ' js';</script>\n`
  + `${body}\n<script>\n${js}\n</script>\n`);

console.log(`built ${data.sections.length} sections / ${ruleCount} rules (${starCount} load-bearing)`);
console.log('  index.html + standalone.html written to the repo root.');
