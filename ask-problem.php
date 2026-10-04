<?php
/* ask-problem.php — problem mode for ask.php: which rules does this problem need?
 *
 * Included by ask.php with $p (the problem), $doc (rules.json) and $titles set.
 * It sits in the webroot, so a direct request just gets a 404.
 *
 * The key, the daily cap and the API call itself live in ask-claude.php.
 */

if (!isset($doc, $titles, $nums, $sheetUrl, $p)) { http_response_code(404); exit; }
require __DIR__ . '/ask-claude.php';

// Haiku: picking rules off a list is a lookup, not hard reasoning, and it's
// the cheapest model by a wide margin.
const ASK_MODEL       = 'claude-haiku-4-5';
const ASK_DAILY_LIMIT = 100;    // problems per day, across everyone
const ASK_MAX_CHARS   = 1000;

$p = trim($p);
if (strlen($p) > ASK_MAX_CHARS) bail(413, 'That problem is over ' . ASK_MAX_CHARS . ' characters. Paste just the part you are stuck on.');

$key = apiKey();
if (!$key) bail(503, "Problem mode isn't set up on this server (no API key). Keyword search still works: ask.php?q=...");

$slot = countToday('ask-usage.json', ASK_DAILY_LIMIT);
if ($slot === false) bail(503, "Can't write data/ask-usage.json, so problem mode is off (it's the spending cap). See README: chown www-data data.");
if ($slot === 'full') bail(429, 'Daily limit of ' . ASK_DAILY_LIMIT . ' problems reached. It resets at midnight UTC. Keyword search still works: ask.php?q=...');

list($ids, $catalog) = catalog($doc, $titles);

$instructions = <<<TXT
You help a student working through pre-algebra and algebra with their own cheat sheet. They paste a problem; you say which rules from the sheet they need to solve it.

Do not provide the answer, only the rules for the student to find the answer themselves. The student is learning by doing the work, so a worked step or a result takes that away from them. That applies to every field: never state the solution, an intermediate result, or what an expression becomes.

Return the rules in the order the student would use them while working the problem. For each one, `here` is one short line pointing at the part of this problem the rule acts on, without carrying the step out. For 3(x−2) = 12, write "the 3 multiplying (x−2)", not "3(x−2) becomes 3x − 6". This goes to a terminal, so write math as plain text (x^(2/3), 3√125) with no LaTeX or markdown.

Include only rules the problem actually needs, plus any trap rule for a mistake this particular problem invites. That's usually two to six rules. If a step needs something the sheet doesn't cover, name it briefly in `missing`, since the student adds rules to the sheet as they find gaps; otherwise leave `missing` empty. If the input isn't a math problem, return no rules and say so in `missing`.

The cheat sheet:
TXT;

$schema = array(
  'type' => 'object',
  'properties' => array(
    'rules' => array('type' => 'array', 'items' => array(
      'type' => 'object',
      'properties' => array(
        'id'   => array('type' => 'string', 'enum' => $ids),
        'here' => array('type' => 'string'),
      ),
      'required' => array('id', 'here'),
      'additionalProperties' => false,
    )),
    'missing' => array('type' => 'string'),
  ),
  'required' => array('rules', 'missing'),
  'additionalProperties' => false,
);

$body = array(
  'model'      => ASK_MODEL,
  'max_tokens' => 4000,
  'system'     => array(
    array('type' => 'text', 'text' => $instructions),
    // Haiku only caches prompts of 4096+ tokens and the catalog is just under,
    // so today this marker is a no-op; it starts paying off as the sheet grows.
    array('type' => 'text', 'text' => $catalog, 'cache_control' => array('type' => 'ephemeral')),
  ),
  'messages'      => array(array('role' => 'user', 'content' => $p)),
  'output_config' => array('format' => array('type' => 'json_schema', 'schema' => $schema)),
);

$res = callClaude($key, $body, array(), 'use keyword search: ask.php?q=...');

$json = null;
foreach ($res['content'] as $block) {
  if ($block['type'] === 'text') { $json = json_decode($block['text'], true); break; }
}
if (!is_array($json) || !isset($json['rules'])) bail(502, "Claude's answer wasn't in the expected shape. Try again.");

// Index the sheet by id. The schema already limits ids to real ones; this also
// drops repeats.
$byId = array();
foreach ($doc['sections'] as $s) foreach ($s['rules'] as $r) $byId[$r['id']] = array($s, $r);

echo "Problem: $p\n\n";
$i = 0; $seen = array();
foreach ($json['rules'] as $pick) {
  if (!isset($byId[$pick['id']]) || isset($seen[$pick['id']])) continue;
  $seen[$pick['id']] = true;
  list($s, $r) = $byId[$pick['id']];
  $i++;
  echo ruleHeader("STEP $i · RULE {$nums[$r['id']]} · {$s['title']}");
  echo (!empty($r['star']) ? '★ ' : '') . plain($r['rule'], $titles) . "\n";
  echo '  Here   ' . trim($pick['here']) . "\n";
  echo '  Why    ' . plain($r['why'], $titles) . "\n";
  if (!empty($r['trap'])) echo '  Trap   ' . plain($r['trap'], $titles) . "\n";
  echo "  $sheetUrl#{$r['id']}\n\n";
}
if (!$i) echo "No rules on the sheet apply.\n\n";
if (trim($json['missing']) !== '') echo 'Not on the sheet: ' . trim($json['missing']) . "\n";
