<?php
/* ask-claude.php — what ask-problem.php and ask-chat.php share: the API key,
 * the daily spending cap, the rule catalog, and the call itself.
 *
 * Talks to the Claude Messages API with PHP's curl extension rather than the
 * Anthropic PHP SDK: the SDK needs Composer and a vendor/ tree, and this repo is
 * deliberately dependency-free and deployed by `git pull` into the webroot.
 *
 * It sits in the webroot, so a direct request just gets a 404.
 */

if (!isset($doc, $titles)) { http_response_code(404); exit; }

function bail($code, $msg) {
  http_response_code($code);
  header('Content-Type: text/plain; charset=utf-8');
  exit(rtrim($msg) . "\n");
}

// The key comes from the environment, or from data/anthropic-key.php, which is
// `<?php return 'sk-ant-...';`. It's a .php file on purpose: if the web server
// ever serves data/, running it prints nothing, where a .txt would print the key.
// data/ is already gitignored and excluded from deploy.sh's rsync --delete.
//
// The include runs inside an output buffer that is always thrown away. A key
// file without a working `<?php` tag (a bare key, or `<?` with short tags off)
// isn't run as PHP -- include just prints it, which put the key on screen.
function apiKey() {
  $key = getenv('ANTHROPIC_API_KEY');
  if ($key) return $key;
  $keyFile = __DIR__ . '/data/anthropic-key.php';
  if (!is_file($keyFile)) return null;
  ob_start();
  $key = include $keyFile;
  ob_end_clean();
  if (is_string($key) && trim($key) !== '') return trim($key);
  bail(503, "data/anthropic-key.php isn't returning the key. It must contain exactly:\n<?php return 'sk-ant-...';\n(See README: Server setup.)");
}

// Daily cap. The endpoint is public and every call costs money, so this fails
// closed: if the counter can't be written, no call is made. Returns true, 'full',
// or false (can't write the file).
function countToday($file, $limit) {
  $fh = @fopen(__DIR__ . '/data/' . $file, 'c+');
  if (!$fh || !flock($fh, LOCK_EX)) return false;
  $u = json_decode(stream_get_contents($fh), true);
  $today = gmdate('Y-m-d');
  if (!is_array($u) || !isset($u['day']) || $u['day'] !== $today) $u = array('day' => $today, 'count' => 0);
  $ok = $u['count'] < $limit;
  if ($ok) {
    $u['count']++;
    ftruncate($fh, 0); rewind($fh);
    fwrite($fh, json_encode($u));
  }
  flock($fh, LOCK_UN); fclose($fh);
  return $ok ? true : 'full';
}

// The catalog: every rule with the fields that say when it applies. It's the
// same bytes on every request, so it sits in the cached system prompt; only
// the problem changes. With $nums, each rule is listed under its sheet number
// ("4.8") so Claude can cite rules the way the sheet prints them.
function catalog($doc, $titles, $nums = null) {
  $ids = array();
  $text = '';
  foreach ($doc['sections'] as $s) {
    $text .= "\n## {$s['title']}\n";
    foreach ($s['rules'] as $r) {
      $ids[] = $r['id'];
      $text .= '- ' . ($nums ? "Rule {$nums[$r['id']]} ({$r['id']})" : $r['id']) . ': ' . plain($r['rule'], $titles);
      if (!empty($r['when'])) $text .= ' When: ' . plain($r['when'], $titles);
      if (!empty($r['trap'])) $text .= ' Trap: ' . plain($r['trap'], $titles);
      $text .= "\n";
    }
  }
  return array($ids, $text);
}

// One Messages API call. Returns the decoded response, or bails with a message
// the person can act on; $fallback is what to suggest instead.
function callClaude($key, $body, $headers, $fallback) {
  $base = getenv('ANTHROPIC_BASE_URL') ?: 'https://api.anthropic.com';
  $ch = curl_init(rtrim($base, '/') . '/v1/messages');
  curl_setopt_array($ch, array(
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 120,
    CURLOPT_HTTPHEADER     => array_merge(array(
      'content-type: application/json',
      'x-api-key: ' . $key,
      'anthropic-version: 2023-06-01',
    ), $headers),
    CURLOPT_POSTFIELDS => json_encode($body),
  ));
  $raw  = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err  = curl_error($ch);

  if ($raw === false) bail(502, "Couldn't reach the Claude API: $err");
  $res = json_decode($raw, true);
  if ($code !== 200) {
    $msg = isset($res['error']['message']) ? $res['error']['message'] : substr($raw, 0, 300);
    bail($code === 429 || $code === 529 ? 503 : 502, "Claude API error ($code): $msg\nTry again in a minute, or $fallback");
  }
  if ($res['stop_reason'] === 'refusal') bail(502, "Claude declined that one. Try rewording it, or $fallback");
  if ($res['stop_reason'] === 'max_tokens') bail(502, "Claude's answer got cut off. Try just the part you're stuck on.");
  return $res;
}
