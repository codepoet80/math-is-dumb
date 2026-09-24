# Dumb Math Rules

A pre-algebra and Algebra I reference where **every rule carries a one-line
reason**. Built for someone whose brain discards bare rules but keeps causes.

```
content/rules.json    the whole sheet — the only file you edit to add material
assets/sheet.css      one stylesheet: screen, print, phone
assets/sheet.js       "I already know this" state (ES5, webOS-safe)
build.js              renders the JSON to HTML.  node build.js
index.html            GENERATED — the sheet. Committed because the server serves it
standalone.html       GENERATED — CSS+JS inlined, one file, works offline
build/artifact.html   GENERATED — fragment for the Claude Code Artifact publisher
serve.sh              rebuild + serve on the LAN for phone/TouchPad testing
deploy.sh             rebuild + rsync the repo to the web server
state.php             server-side: reads/writes the "I know this" marks
ask.php               server-side: find rules from curl — by keyword, or paste a problem
ask-problem.php       ask.php's problem mode: asks Claude which rules a problem needs
data/                 state.json lives here at runtime; never committed
tools/                print-verification harness; never deployed
```

## How the sheet is organised

Two structural things carry real information, so they're worth knowing. They used
to be printed at the bottom of the page; they were cluttering the UI, so they live
here now.

The sheet covers **pre-algebra fundamentals (01-08)** and then **Algebra I
(09-15)**, with word-problem translation last because it applies to all of it.

**Sections are numbered in dependency order.** `01 The Grammar Nobody Teaches` is
assumed by everything after it, and each section leans on the ones before. If a
later rule won't stick, the missing piece is usually earlier — go back rather than
re-reading the rule.

**Twenty-one rules are flagged load-bearing.** Those aren't the *most important* rules,
they're the ones that **generate** other rules. "The denominator is the name of the
piece, not a quantity" is one sentence that makes four other fraction rules stop
needing to be memorised. They get a heavier left rail and a `load-bearing` tag.
That's the best retention-per-minute on the sheet.

## The content model

`content/rules.json` is the single source of truth. Every entry is the same shape:

```json
{
  "rule": "Adding or subtracting needs a common denominator first.",
  "why":  "You can't count pieces of different sizes — same reason 3 feet + 2 meters isn't 5 of anything.",
  "when": "See + or - between fractions: convert first.",
  "trap": "2/3 + 1/3 = 3/3, not 3/6.",
  "example": "...",
  "mnemonic": "...",
  "star": true
}
```

- `rule` and `why` are required. Everything else is optional and only renders if present.
- `id` is **stable and permanent**. It keys the "I know this" state, both in
  `data/state.json` on the server and in each browser's cache, so changing one
  silently resets that rule everywhere. Reword freely; never renumber. New rules get a fresh id; `build.js` throws on a missing or duplicate one.
- `star: true` marks a **load-bearing** rule — one that *generates* other rules.
- Inline markup is deliberately tiny: `` `code` ``, `**bold**`, `*emphasis*`,
  `^`/`_` for super- and subscripts (`x^2`, `x^{a+b}`, `y_1`), and `#{section-id}`
  for a cross-reference. Nothing else.
- Inside backticks, math is set like a textbook: `a/b` (or `a / b`) stacks into a
  fraction, `√x` and `√(a+b)` get a bar over the radicand, `^3√x` puts the 3 in the
  radical's crook, and parens that only group a numerator, denominator or radicand
  are dropped. So write `(x+1)/(x−1)`, not `x+1/x−1`, because the parens are what
  say where the fraction ends. Fractions inside exponents (`x^{2/3}`) stay inline.
  Outside backticks, `/` is just a slash.
- Rules are numbered `section.position` (`4.8`) on the sheet and in `ask.php`'s
  output, counted from array order on both sides. Reordering renumbers everything,
  which is fine: the number is for finding a rule, and the stable `id` is what
  stores state. Each rule's element id is its `id`, so `index.html#ex-rule-id`
  links straight to it.
- **Cross-reference sections as `#{section-id}`, never by number.** It resolves to
  the section's position at build time, so reordering can't leave a stale "see 06"
  behind. An unknown id fails the build rather than rendering wrong.
- **Never paste a Unicode superscript** (`x²`, `xᵃ`, `x⁽ᵃ⁺ᵇ⁾`). Write `x^2`, `x^a`,
  `x^{a+b}` and let the renderer emit `<sup>`. See Design notes for why.
- Sections are in **dependency order**. Renumbering happens automatically from array order.

## Build

```sh
node build.js
```

Output lands in the **repo root**, because the repo root *is* the webroot:

| file | for |
|---|---|
| `index.html` | the sheet. Generated, not authored — don't hand-edit it |
| `standalone.html` | CSS **and** JS inlined, one file — offline, sideload, email |
| `build/artifact.html` | body fragment for the Claude Code Artifact publisher |

`assets/` is served straight from source, so nothing is copied or duplicated.

No npm, no dependencies, no build tooling. It's one file of Node reading one file of JSON.

## Testing on the phone and the TouchPad

```sh
./serve.sh          # rebuilds, then serves the repo on the LAN
```

It prints a `http://192.168.x.x:8000/` URL — open that on either device. Both are
on the same Wi-Fi, so nothing needs deploying to iterate. It serves the repo root,
which is exactly what the web server publishes, so what you test is what you get.

It uses `php -S` when `php` is installed, so `state.php` runs and the cross-device
sync is testable locally (state lands in `data/state.json`, which is gitignored).
Without PHP it falls back to Python's static server and the tally shows
*not synced*.

The local server is plain HTTP simply because it's a throwaway LAN server. HTTPS
works fine on the deployed site for both devices — the TouchPad's TLS stack and root
store are patched.

The renderer's constraint is the browser engine, not the network: WebKit 534 has no
CSS custom properties and no modern flexbox. That's what the fallbacks in
`assets/sheet.css` are for, and it's why `assets/sheet.js` is ES5.

## Deploying

**The deploy is `git pull` on the server.** The repo root is the webroot:
`index.html` and `assets/` sit exactly where the server wants them. Nothing is built
on the server. The only request-time code is `state.php` (see *Cross-device state*) and `ask.php`
(see *Asking from a terminal*).

```sh
# on the server
cd /path/to/webroot && git pull
```

Remote: `git@github.com:codepoet80/math-is-dumb.git`

Because the whole repo lands in the webroot, `build.js`, `README.md`, `tools/` and
the shell scripts are served too. See *What actually lands on the server* below.

`deploy.sh` is an rsync-based alternative for a host without git. It is **not** the
path in use, and its exclude list has no effect on a `git pull` deploy.

Because `index.html` is generated but must exist on the server, **it is committed**.
Run `node build.js` before syncing or you'll ship a stale page — `deploy.sh` does
this for you, which is the main reason to use it over a bare rsync.

### What actually lands on the server

A `git pull` deploy publishes the entire working tree, so everything tracked is
reachable over HTTP. Verified against the live site:

| path | status |
|---|---|
| `.git/HEAD`, `.git/config`, `.git/index` | **403** — blocked by an existing server rule |
| `index.html`, `assets/`, `content/rules.json` | 200 — intended |
| `state.php` | 200 — intended; the sync endpoint |
| `ask.php` | 200 — intended; rule search, and problem mode (calls the Claude API) |
| `ask-problem.php` | 404 — only runs when `ask.php` includes it |
| `data/anthropic-key.php` | 200 with an empty body — it's PHP, so running it prints nothing |
| `data/state.json` | should be **403** (`data/.htaccess`, Apache only) — not secret either way |
| `README.md`, `build.js`, `tools/`, `*.sh` | 200 — served but unused |

**`.git/` is the only exposure that would genuinely matter**, since it lets anyone
reconstruct the full repo and history, and it is already denied. Re-check it after
any server change:

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://apps.jonandnic.com/math/.git/config
```

Nothing else in the repo is secret — no credentials, no personal data, no host
details. Serving `build.js` and `README.md` is untidy, not risky.

Also worth confirming directory listing is off, which no deploy method can control:

```sh
curl -sI https://apps.jonandnic.com/math/assets/ | head -1   # want 403/404, not 200
```

### Cross-device state

`state.php` keeps the "I know this" marks in `data/state.json` so they follow you
between the phone, the TouchPad and the desktop. One-time setup on the server:

```sh
cd /path/to/webroot
mkdir -p data && chown www-data data                 # PHP runs as www-data on this host
curl -s https://apps.jonandnic.com/math/state.php    # want {"known":{},"hide":false,...}
```

The `chown` is the step that matters. `git pull` creates `data/` owned by whoever
ran it, and PHP runs as `www-data`, which can't write there until it owns the folder
(a `chmod 775` alone wasn't enough). `state.php` will create `data/` itself on a host
where the PHP user can already write to the webroot, but that isn't this one. If the
folder isn't writable, the page still works and the tally says *not synced*.

The protocol is deliberately delta-based. `GET` returns the whole state; `POST` sends
only what changed — `{"set":{"rule-id":1}}`, `{"hide":true}` or `{"reset":true}` — and
the server merges it under a lock and returns the full state, which the page adopts.
**Why deltas:** two devices with the page open would otherwise race, and the second
one to save would wipe whatever the first had marked. A per-rule merge makes the
worst case "the rule you clicked", never "everything you marked yesterday".

Rule ids are validated against `content/rules.json` on the server, so nothing that
isn't a rule can be stored. There is no login on purpose: the state is a list of
which rules Jon knows. That isn't worth a password, and the validation caps what a
stranger could do to "toggle some marks".

## Asking from a terminal

Paste a problem and `ask.php` lists the rules it needs, in the order you'd use them,
each with a line pointing at where it applies in *this* problem. It never gives the
answer or works a step, because the point is that you do the work:

```sh
curl https://apps.jonandnic.com/math/ask.php --data-urlencode 'p=3(x-2) = 12'
curl https://apps.jonandnic.com/math/ask.php --data-urlencode 'p=125^(-2/3)'
curl https://apps.jonandnic.com/math/ask.php --data-urlencode 'p=Two trains leave...'
```

```
━━ STEP 1 · RULE 5.2 · Distributing & Factoring ━━━━━━━━━━━━━━━━
a(b + c) = ab + ac
  Here   the 3 multiplying (x−2)
  Why    3 bags each holding (2 apples + 1 pear) gives you 6 apples and 3 pears...
  https://apps.jonandnic.com/math/#ds-rule

━━ STEP 2 · RULE 6.2 · Solving for x ━━━━━━━━━━━━━━━━━━━━━━━━━━━
★ Undo operations in reverse PEMDAS order...
```

The rule number matches the one printed on the sheet, and the link opens the sheet
scrolled to that rule, shown in full even if you've marked it known.

If a step needs something the sheet doesn't have, it ends with a *Not on the sheet:*
line, which tells you what rule to add next.

Problem mode asks Claude (`claude-haiku-4-5`) which rules apply, because a
problem like `3(x-2) = 12` has no keywords to search for. Recognising "distribute,
then undo" means reading the problem's structure. Claude can't rewrite the sheet:
its answer is limited by a schema to rule ids that exist, and the rule, why and trap
are printed from `rules.json`. Only the *Here* line is Claude's own writing, and the
prompt tells it to point at the problem, not solve it. Haiku is enough for this:
picking rules off a list is a lookup, not hard reasoning. For better picks, change
`ASK_MODEL` in `ask-problem.php` (`claude-sonnet-5` costs about 2× as much).

It calls the API with PHP's curl extension instead of the Anthropic PHP SDK,
because the SDK needs Composer and a `vendor/` tree, and this repo stays
dependency-free.

**Server setup (once).** Put the API key where `ask-problem.php` looks for it:

```sh
cd /path/to/webroot
printf "<?php return '%s';\n" 'sk-ant-...' > data/anthropic-key.php
chown www-data data/anthropic-key.php && chmod 600 data/anthropic-key.php
```

`data/` is already gitignored and excluded from `deploy.sh`'s `rsync --delete`, so
the key is never committed and a deploy never wipes it. The key file is PHP rather
than plain text so that if the server ever serves `data/`, requesting it runs the
file and prints nothing, where a `.txt` would print the key. An `ANTHROPIC_API_KEY`
environment variable also works and takes precedence. Without a key, problem mode
answers 503 and keyword mode still works.

**Cost and the cap.** The endpoint is public, so `ASK_DAILY_LIMIT` (100 problems a
day, shared by everyone, reset at midnight UTC) caps what a stranger could spend.
The count lives in `data/ask-usage.json`. If that file can't be written, problem
mode refuses to call the API: it fails closed because the cap is a spending guard.
A question costs about half a cent. Most of that is the ~13 KB rule catalog (about
3.5k tokens), which goes out with every request. It carries a cache marker, but Haiku
only caches prompts of 4096+ tokens, so the marker does nothing until the sheet grows
past that. At the cap, the most a day can cost is about 60¢. It's worth also
setting a monthly spend limit on the key in the Claude Console.

**Keyword mode** finds the rules that match some keywords and prints them as plain
text, with their why, trap and example:

```sh
curl 'https://apps.jonandnic.com/math/ask.php?q=negative+exponent'
curl -G https://apps.jonandnic.com/math/ask.php --data-urlencode 'q=125^(-2/3)'
curl 'https://apps.jonandnic.com/math/ask.php?q=exponents'      # a section name lists the whole section
curl 'https://apps.jonandnic.com/math/ask.php?q=fraction&n=10'  # more results (default 5)
```

Use `--data-urlencode` for pasted math, because a raw `^`, `/` or `+` in a URL gets mangled.
Pasted math also gets translated into the sheet's words: `^` searches exponents, `^-`
adds negative, and `^(2/3)` adds fractional/root, so `125^(-2/3)` finds the
negative-fractional-exponent rule first.

The scoring is plain keyword counting, weighted by where the word appears (the rule
line beats the section title, which beats the why). It's kept that simple so the
ranking is predictable. It reads `content/rules.json` on every request, so a new
rule is searchable as soon as it's pulled, with no build step. It's read-only and
writes nothing.

## Print

Nothing is ever split across a column or a page:

- `.rule` carries `break-inside: avoid` (plus the `page-break-` and
  `-webkit-column-break-` spellings).
- **`.sechead` wraps the heading, blurb and first rule in one box** that also
  carries `break-inside: avoid`, so a heading can never be stranded at the foot of
  a column with its first rule in the next one.
- `.section > h2` and `.blurb` also carry `break-after: avoid`. That is belt and
  braces for Chrome; it is **not** what makes this work.
- `p, dd { orphans: 2; widows: 2 }` as a line-level safety net.

### Why the wrapper, and not just `break-after: avoid`

**Firefox ignores `break-after: avoid`** (a long-standing Gecko gap). Chrome honours
it — which is exactly how this got missed: a Chrome-only test reported a clean bill
of health while the real Firefox printout had three stranded headings.

`break-inside: avoid` *is* honoured by Gecko, so the keep-together group has to be
an actual box rather than a hint on its neighbours.

Don't identify the engine from a PDF's `Producer` string. `macOS Version 15.7.9`
is the macOS print pipeline, which Firefox, Safari and anything else using the
system print dialog all go through. It says nothing about the renderer.

**Don't unwrap `.sechead` to tidy up the markup.** It is load-bearing for print.

### Verifying print breaks

`pdftotext -bbox-layout` gives real page geometry, which is the only way to see
page breaks — CSS emulation in a viewport cannot paginate. A heading is stranded
when no `WHY` label follows it in the same column:

`tools/ffprint.py` prints a page to PDF using **real Firefox**, driven through the
Marionette socket built into the browser (no geckodriver needed). Use it rather than
simulating another engine's quirks:

```sh
python3 tools/ffprint.py file:///path/to/index.html out.pdf
python3 tools/checkbreaks.py out.pdf
```

| PDF (real Firefox, 4 pages) | headings | stranded |
|---|---|---|
| Real printout, before the fix | 16 | 3 |
| Control: `.sechead` neutralised | 16 | 3 *(same three sections)* |
| Fixed | 16 | **0** |

Two ways this test lied before it was trusted:

- An early checker located **1 of 16** headings and cheerfully reported "0 stranded".
  Headings tokenise differently per engine — Firefox emits `10` as its own text run,
  Chrome merges it into `10The Coordinate Plane`. **Always confirm it found all 16.**
- A control page written outside the repo couldn't resolve `assets/sheet.css`, so it
  rendered unstyled: 14 pages, every heading "stranded", conclusion worthless. Keep
  control copies in the repo root.

`Cmd-P` from any of the HTML outputs. The print stylesheet takes over: two dense
columns, letter portrait, black on white, ~8pt. Turn **background graphics off** in
the print dialog (the screen version sits on a graph-paper ground that you don't
want on paper).

## "I already know this"

Each rule has a caret toggle on the right: **up collapses** a rule you already know,
**down brings it back**. A collapsed rule shrinks to one ellipsis-truncated line
(122px → 30px for a long rule);
ticking *Hide what I know* drops the marked rules out of the page **and out of the
printout**, so the sheet gets shorter as you learn. A section whose rules are all
marked disappears wholesale.

The server is the source of truth (see *Cross-device state* above). `localStorage`
under `dmr.known.v1` / `dmr.hide.v1` is only a cache, falling back to a cookie when
storage throws (Safari private browsing, webOS with site data off). Worst case is
~1.2 KB of ids, comfortably inside the 4 KB cookie limit. The cache exists so the
page paints correctly *before* the fetch returns, and so `standalone.html`, `file://`
and a PHP-less host keep working on their own.

Load order is: paint from the cache, fetch from the server, adopt whatever it says.
Every click posts its own delta and adopts the reply. Returning focus to a tab after
5 s re-fetches, so marks made on another device show up without a reload. If the
first fetch fails the page stays local and the tally says *not synced*; a later
click on that page is then not sent, and the next successful load takes the server's
version. That trade — a lost click on a flaky connection rather than a stale device
overwriting the server — is the intended one.

Two non-obvious constraints in the CSS around that toggle:

- The collapsed rule is dimmed with `color`, **never `opacity`**. Opacity creates a
  stacking context, and since the `<p>` block box runs underneath the right-floated
  button, the paragraph then paints over it and silently swallows every click. The
  button also carries `position: relative; z-index: 1` as a second line of defence.
- The marked state is a faint tint, not a solid fill. A saturated button beside dimmed
  grey text makes the rules you *know* the loudest thing on the page, which is backwards.
- The collapsed line gets `overflow: hidden` for the ellipsis, and that *also* does the
  layout work: it establishes a block formatting context, and a BFC box shrinks to avoid
  floats instead of sliding under them. Without it the `nowrap` text would run behind the
  arrow. Print overrides it back to `white-space: normal` — paper has no disclosure
  control, so truncating there would just lose information.

`assets/sheet.js` is ES5 with no libraries and no DOM API newer than WebKit 534. No
`let`/`const`, no arrows, no `classList`, no `dataset`, no `NodeList.forEach`, no
`Array.from`. That's the TouchPad's floor, not a style preference.

## Design notes

The stylesheet ships literal colour fallbacks *before* every `var()`:

```css
color: #14181c; color: var(--ink);
```

This is not redundancy — the TouchPad's WebKit 534 has no CSS custom properties.
Old browsers take the literal (light theme), current ones take the token and get
dark mode. Don't "clean this up."

### Glyphs, not just CSS

The TouchPad's font stack is from 2011 and has no coverage for rare codepoints.
Anything outside Latin-1 is a gamble; anything in Phonetic Extensions or
Superscripts & Subscripts is a loss. Two consequences:

- **Superscripts are `<sup>` markup, never characters.** `x^2` / `x^{a+b}` in the
  JSON become real `<sup>` elements built from plain ASCII. `xᵃ` (U+1D43) rendered
  as an empty box on the device.
- **The collapse arrow is a CSS border triangle**, not `▴`/`▾` (U+25B4/U+25BE),
  which also had no glyph. It's a real `<span class="tri">` with `width: 0;
  height: 0` and asymmetric borders — no font, no image, no pseudo-element, and it
  flips direction off the `.known` class so the JS never touches it.

Characters still in play that are *probably* fine but were never confirmed on the
device: `−` (U+2212 minus), `√` (U+221A), `→` (U+2192), and curly quotes. If any of
them box out, the fixes are ASCII `-`, a `<span class="radical">`, `->`, and straight
quotes respectively.

The same trick covers flexbox, and there it's load-bearing rather than cosmetic:

```css
html.js .controls { display: block; display: flex; }
```

The controls strip is `display: none` until JS marks the page. If the only display
value were `flex`, WebKit 534 would drop that declaration as unparseable, the strip
would stay hidden, and the feature would be unreachable on the TouchPad with no
visible error. Any rule that turns an element *on* needs a pre-flex fallback.

## Not built yet

- **Statistics** — the actual destination. Summation notation, mean/median/SD, the
  mu-vs-x-bar and sigma-vs-s distinction, z-scores, distributions, correlation,
  t-tests, p-values, effect size. Section 10 (lines) and 15 (scientific notation)
  were written with this in mind: a regression line is `y = mx + b` in different
  letters, and p-values arrive in scientific notation.
- Logarithms and exponential functions
- A `#{rule-id}` cross-reference to complement `#{section-id}`, for the several
  places one rule leans directly on another
- EPUB export (opens in the reader already on both devices)
- Study/flashcard mode — rule on the front, why on the back (the `known` state is
  the obvious input: drill what isn't marked)
- Search
