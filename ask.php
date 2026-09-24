<?php
/* ask.php — find the relevant rules from a terminal. Two modes:
 *
 * Problem mode (p=): paste a problem, get the rules it needs, in the order
 * you'd use them, each with a line showing where it applies.
 *
 *   curl https://apps.jonandnic.com/math/ask.php --data-urlencode 'p=3(x-2) = 12'
 *   curl https://apps.jonandnic.com/math/ask.php --data-urlencode 'p=125^(-2/3)'
 *
 * Keyword mode (q=): search the sheet's text.
 *
 *   curl 'https://apps.jonandnic.com/math/ask.php?q=negative+exponent'
 *   curl 'https://apps.jonandnic.com/math/ask.php?q=exponents&n=10'
 *
 * Both return plain text and read content/rules.json directly, so a new rule
 * is findable as soon as it's pulled — no build step involved.
 *
 * Problem mode asks Claude which rules apply, because a problem like
 * `3(x-2) = 12` has no keywords in it — spotting "distribute, then undo" takes
 * reading the structure. Claude only ever returns rule ids (the schema limits it
 * to ids that exist); every rule's text is still printed from rules.json, so
 * it can't invent or reword a rule. The API key lives in data/anthropic-key.php
 * (see README) and a daily cap bounds what a stranger could spend.
 *
 * Keyword mode is deliberately dumb keyword scoring, not anything clever: the
 * sheet is 86 rules, and a result you can predict beats one you have to
 * second-guess. A little help for pasted math: `^` means exponents, `^-` means
 * negative exponents, `^(2/3)` means fractional exponents/roots, `√` means roots.
 */

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');

$doc = json_decode(@file_get_contents(__DIR__ . '/content/rules.json'), true);
if (!$doc || empty($doc['sections'])) {
  http_response_code(500);
  exit("content/rules.json unreadable\n");
}

$titles = array();
foreach ($doc['sections'] as $s) $titles[$s['id']] = $s['title'];

// Sheet markup -> something readable in a terminal.
function plain($t, $titles) {
  $t = preg_replace_callback('/#\{([a-z-]+)\}/', function ($m) use ($titles) {
    return 'see ' . (isset($titles[$m[1]]) ? $titles[$m[1]] : $m[1]);
  }, $t);
  $t = preg_replace('/\^([0-9a-z])√/u', '$1√', $t);   // ^3√x -> 3√x
  $t = str_replace(array('^{', '_{'), array('^(', '_('), $t);
  $t = preg_replace('/(\^|_)\(([^{}]*)\}/', '$1($2)', $t);
  $t = str_replace(array('`', '**'), '', $t);
  return preg_replace('/(?<![\w*])\*(\S[^*]*)\*/', '$1', $t);
}

// Crude stem so "exponents" finds "exponent" and "factoring" finds "factor".
function stem($w) {
  $w = preg_replace('/(ing|ed|es|s)$/', '', $w);
  return strlen($w) >= 3 ? $w : '';
}

function words($t) {
  preg_match_all('/[a-z]+/', strtolower($t), $m);
  return array_values(array_filter(array_map('stem', $m[0])));
}

$STOP = array_flip(array('the','and','how','what','why','when','doe','with','for',
  'thi','that','are','you','can','need','rule','about','mean','get','use','work',
  'solve','simplify','problem','number','math'));

$p = isset($_POST['p']) ? $_POST['p'] : (isset($_GET['p']) ? $_GET['p'] : '');
if (trim($p) !== '') {
  require __DIR__ . '/ask-problem.php';
  exit;
}

$q = isset($_GET['q']) ? $_GET['q'] : (string) key($_GET);
$n = isset($_GET['n']) ? max(1, min(86, (int) $_GET['n'])) : 5;
$q = trim($q);

if ($q === '') {
  echo "Paste a problem to get the rules it needs:\n\n";
  echo "  curl https://apps.jonandnic.com/math/ask.php --data-urlencode 'p=3(x-2) = 12'\n\n";
  echo "Or search the sheet by keyword:\n\n";
  echo "  curl 'https://apps.jonandnic.com/math/ask.php?q=negative+exponent'\n";
  echo "  curl -G https://apps.jonandnic.com/math/ask.php --data-urlencode 'q=125^(-2/3)'\n";
  echo "  add &n=10 for more results (default 5)\n\nSections:\n";
  foreach ($titles as $id => $t) echo "  $id — $t\n";
  exit;
}

// Pasted math -> the words the sheet uses for it.
$extra = '';
if (strpos($q, '^') !== false || strpos($q, '**') !== false) $extra .= ' exponent';
if (preg_match('/\^\(?\s*[-−]/u', $q)) $extra .= ' negative';
if (preg_match('/\^\(?\s*[-−]?\s*\w+\s*\/\s*\w+/u', $q)) $extra .= ' fractional root';
if (preg_match('/√|sqrt|radical/u', $q)) $extra .= ' root';

$terms = array();
foreach (words($q . $extra) as $w) if (!isset($STOP[$w])) $terms[$w] = true;
$terms = array_keys($terms);

// A section name or id on its own ("exponents") lists that whole section.
$qs = stem(strtolower($q));
$only = null;
foreach ($doc['sections'] as $s) {
  if ($qs !== '' && ($qs === stem($s['id']) || $qs === stem(strtolower($s['title'])))) $only = $s['id'];
}

$hits = array();
foreach ($doc['sections'] as $s) {
  foreach ($s['rules'] as $r) {
    if ($only) {
      if ($s['id'] === $only) $hits[] = array(0, $s, $r);
      continue;
    }
    // Where a word appears says how much the rule is *about* it.
    $fields = array(
      array(4, $r['rule']),
      array(3, $s['title'] . ' ' . $r['id']),
      array(1, implode(' ', array_intersect_key($r, array_flip(
        array('why','when','trap','example','mnemonic'))))),
    );
    $score = 0; $matched = 0;
    foreach ($terms as $t) {
      $best = 0;
      foreach ($fields as $f) {
        foreach (words($f[1]) as $w) {
          if ($w === $t || (strlen($t) >= 4 && strpos($w, $t) === 0)) { $best = max($best, $f[0]); break; }
        }
      }
      if ($best) { $score += $best; $matched++; }
    }
    if (!$matched) continue;
    // Rules matching *all* the words beat rules matching one word a lot.
    $score *= $matched / count($terms);
    if (!empty($r['star'])) $score += 0.5;
    $hits[] = array($score, $s, $r);
  }
}

if (!$hits) {
  http_response_code(404);
  exit("No rules match \"$q\". Try a plainer word (exponent, fraction, root...) or ask.php with no query for the section list.\n");
}

if (!$only) usort($hits, function ($a, $b) { return $b[0] < $a[0] ? -1 : ($b[0] > $a[0] ? 1 : 0); });
$shown = $only ? $hits : array_slice($hits, 0, $n);

$LABELS = array('why' => 'Why', 'when' => 'When', 'trap' => 'Trap', 'example' => 'Ex.', 'mnemonic' => 'Memory');
foreach ($shown as $h) {
  list(, $s, $r) = $h;
  echo (!empty($r['star']) ? '★ ' : '') . plain($r['rule'], $titles) . "\n";
  foreach ($LABELS as $k => $label) {
    if (!empty($r[$k])) echo '  ' . str_pad($label, 7) . plain($r[$k], $titles) . "\n";
  }
  echo "  [{$s['title']} · {$r['id']}]\n\n";
}
if (!$only && count($hits) > $n) echo '(' . (count($hits) - $n) . " more — add &n=" . count($hits) . " to see all)\n";
