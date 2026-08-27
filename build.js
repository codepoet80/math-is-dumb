#!/usr/bin/env node
/* build.js — renders content/rules.json into static HTML.
 *
 * Static on purpose: no request-time PHP, no JS on the device. The same file
 * prints correctly, serves from any host, and opens on the TouchPad browser.
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

// inline markup: `code`, **bold**, *emphasis*. Bold runs first so the
// single-asterisk pass only ever sees genuine emphasis.
const md = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\*([^*]+)\*/g, '<em>$1</em>');

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pad  = n => String(n).padStart(2, '0');

const FIELDS = [
  ['why',      'Why'],
  ['when',     'When'],
  ['trap',     'Trap'],
  ['example',  'Ex.'],
  ['mnemonic', 'Hook'],
];

function renderRule(r) {
  const rows = FIELDS
    .filter(([key]) => r[key])
    .map(([key, label]) => `          <dt>${label}</dt><dd class="${key}">${md(r[key])}</dd>`)
    .join('\n');
  const flag = r.star ? '<span class="flag">load-bearing</span>' : '';
  if (!r.id) throw new Error('rule is missing a stable id: ' + r.rule);
  return `        <div class="rule${r.star ? ' star' : ''}" data-id="${esc(r.id)}">
          <button class="know" type="button" aria-pressed="false" aria-label="Collapse this rule">▴</button>
          <p class="r">${md(r.rule)}${flag}</p>
          <dl>
${rows}
          </dl>
        </div>`;
}

function renderSection(s, i) {
  const id = s.id || slug(s.title);
  return `      <section class="section" id="${esc(id)}">
        <h2><span class="n">${pad(i + 1)}</span>${md(s.title)}<span class="scount"> </span></h2>
        ${s.blurb ? `<p class="blurb">${md(s.blurb)}</p>` : ''}
${s.rules.map(renderRule).join('\n')}
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
