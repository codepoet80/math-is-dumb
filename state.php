<?php
/* state.php — shared "I already know this" state, so it follows you between
 * the phone, the TouchPad and the desktop.
 *
 *   GET  state.php                       -> {"known":{id:1,...},"hide":false,"updated":ts}
 *   POST state.php  {"set":{id:1|0}}     merge per-rule changes
 *                   {"hide":true|false}  set the hide toggle
 *                   {"reset":true}       unmark everything
 *
 * Every POST is a *delta*, never the whole state. That is what makes two
 * devices safe: each click is one atomic read-modify-write on the server under
 * a lock, so a stale tab can only change the rule it clicked, not overwrite
 * what another device marked. The response is always the full merged state,
 * and the client adopts it.
 *
 * Rule ids are validated against content/rules.json, so this endpoint cannot
 * store anything that isn't a rule on the sheet. There is no login: the state
 * is a list of which rules Jon knows, which is not worth protecting, and the
 * validation caps what a stranger could write to "toggled some rules".
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$DIR  = __DIR__ . '/data';
$FILE = $DIR . '/state.json';

function reply($state) {
  echo json_encode(array(
    'known'   => (object) $state['known'],   // (object) so an empty map is {} not []
    'hide'    => (bool) $state['hide'],
    'updated' => (int) $state['updated'],
  ));
  exit;
}

function fail($code, $msg) {
  http_response_code($code);
  echo json_encode(array('error' => $msg));
  exit;
}

function validIds() {
  $doc = json_decode(@file_get_contents(__DIR__ . '/content/rules.json'), true);
  if (!$doc || empty($doc['sections'])) fail(500, 'content/rules.json unreadable');
  $ids = array();
  foreach ($doc['sections'] as $s) {
    foreach ($s['rules'] as $r) $ids[$r['id']] = true;
  }
  return $ids;
}

function emptyState() {
  return array('known' => array(), 'hide' => false, 'updated' => 0);
}

function decode($raw) {
  $s = json_decode($raw, true);
  if (!is_array($s)) return emptyState();
  return array(
    'known'   => (isset($s['known']) && is_array($s['known'])) ? $s['known'] : array(),
    'hide'    => !empty($s['hide']),
    'updated' => isset($s['updated']) ? (int) $s['updated'] : 0,
  );
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  reply(is_file($FILE) ? decode(@file_get_contents($FILE)) : emptyState());
}

if ($method !== 'POST') fail(405, 'GET or POST only');

$raw = file_get_contents('php://input');
if (strlen($raw) > 16384) fail(413, 'body too large');
$delta = json_decode($raw, true);
if (!is_array($delta)) fail(400, 'body must be a JSON object');

if (!is_dir($DIR) && !@mkdir($DIR, 0775, true)) fail(500, 'cannot create data/');

// Read-modify-write under an exclusive lock. 'c+' creates the file if it is
// missing without truncating it, which is what lets us lock before reading.
$fh = @fopen($FILE, 'c+');
if (!$fh) fail(500, 'data/ is not writable by the web server');
if (!flock($fh, LOCK_EX)) { fclose($fh); fail(500, 'could not lock state file'); }

$state = decode(stream_get_contents($fh));

if (!empty($delta['reset'])) $state['known'] = array();

if (isset($delta['set']) && is_array($delta['set'])) {
  $ids = validIds();
  foreach ($delta['set'] as $id => $on) {
    if (!isset($ids[$id])) continue;          // not a rule on the sheet: ignore
    if ($on) $state['known'][$id] = 1; else unset($state['known'][$id]);
  }
}

if (array_key_exists('hide', $delta)) $state['hide'] = !empty($delta['hide']);

$state['updated'] = time();

$out = json_encode(array(
  'known' => (object) $state['known'], 'hide' => $state['hide'], 'updated' => $state['updated'],
));
rewind($fh);
ftruncate($fh, 0);
fwrite($fh, $out);
fflush($fh);
flock($fh, LOCK_UN);
fclose($fh);

reply($state);
