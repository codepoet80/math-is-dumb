# Dumb Math Rules

A pre-algebra reference where **every rule carries a one-line reason**. Built for
someone whose brain discards bare rules but keeps causes.

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

**Twenty rules are flagged load-bearing.** Those aren't the *most important* rules,
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
- `id` is **stable and permanent**. It keys the per-device "I know this" state, so
  changing one silently resets that rule for every device. Reword freely; never
  renumber. New rules get a fresh id; `build.js` throws on a missing or duplicate one.
- `star: true` marks a **load-bearing** rule — one that *generates* other rules.
- Inline markup is deliberately tiny: `` `code` ``, `**bold**`, `*emphasis*`,
  `^`/`_` for super- and subscripts (`x^2`, `x^{a+b}`, `y_1`), and `#{section-id}`
  for a cross-reference. Nothing else.
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

The local server is plain HTTP simply because it's a throwaway LAN server. HTTPS
works fine on the deployed site for both devices — the TouchPad's TLS stack and root
store are patched.

The renderer's constraint is the browser engine, not the network: WebKit 534 has no
CSS custom properties and no modern flexbox. That's what the fallbacks in
`assets/sheet.css` are for, and it's why `assets/sheet.js` is ES5.

## Deploying

**Syncing the repo is the deploy.** `index.html` and `assets/` sit at the repo root
where the server already wants them, so point the webroot (or a vhost alias) at the
synced directory and it works. Nothing is built on the server, and no PHP runs at
request time.

```sh
TARGET=you@host:/var/www/math/ ./deploy.sh
```

Or set `TARGET` at the top of `deploy.sh` and just run it. It rebuilds first, then
rsyncs with `--delete`, excluding `.git/`, `build/`, and the shell scripts.

Because `index.html` is generated but must exist on the server, **it is committed**.
Run `node build.js` before syncing or you'll ship a stale page — `deploy.sh` does
this for you, which is the main reason to use it over a bare rsync.

`.htaccess` turns off directory listing and denies `build.js`, `README.md` and the
shell scripts. Nothing there is secret; there's just no reason to serve it. On nginx
the equivalent is:

```nginx
location ~ ^/(build\.js|README\.md|.*\.sh)$ { return 404; }
```

`content/rules.json` stays readable on purpose — it's the source of truth and it's
useful to be able to curl it.

PHP only becomes useful later, if you want server-side search or study progress that
follows you between devices.

## Print

Nothing is ever split across a column or a page:

- `.rule` carries `break-inside: avoid` (plus the `page-break-` and
  `-webkit-column-break-` spellings, because the modern property alone isn't
  enough on older engines).
- `.section > h2` and `.blurb` carry `break-after: avoid`, so a heading is never
  stranded at the foot of a column with its first rule in the next one. This was a
  real bug — before the `break-after` rules, a heading was orphaned at every column
  height tested.
- `p, dd { orphans: 2; widows: 2 }` as a line-level safety net.

Verified by forcing 63 column boundaries across five column heights under emulated
print media and measuring `getClientRects()` on all 80 rules: a fragmented box
returns rects in more than one column. Zero rules fragmented, zero headings
stranded. (Comparing PDF page counts with and without the rules was *not* a useful
check — both came out at 4 pages, so the constraint wasn't binding on page count.)

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

State lives in `localStorage` under `dmr.known.v1` / `dmr.hide.v1`, falling back to a
cookie when storage throws (Safari private browsing, webOS with site data off). Worst
case is ~1.2 KB of ids, comfortably inside the 4 KB cookie limit.

It is **per-device on purpose** — nothing syncs, nothing leaves the device. What you
know on the phone is tracked separately from what you know on the TouchPad, which is
the honest model: recall on a 4-inch screen at a bus stop is not recall in an exam.

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
- EPUB export (opens in the reader already on both devices)
- Study/flashcard mode — rule on the front, why on the back (the `known` state is
  the obvious input: drill what isn't marked)
- Search
