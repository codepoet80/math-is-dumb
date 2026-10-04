<?php
/* ask-chat.php — chat mode for ask.php: work a problem through with a tutor
 * that points at the sheet's rules and leaves the arithmetic to you.
 *
 * Included by ask.php for POST ask.php?chat, with $doc, $titles and $nums set.
 * It sits in the webroot, so a direct request just gets a 404.
 *
 * The page keeps the conversation and sends all of it every turn, as
 *   {"messages": [{"role": "user", "content": "..."}, ...]}
 * and gets back {"reply": "..."}. Nothing is stored here, so there's no session
 * to expire and no transcript on the server. Errors come back as plain text,
 * which the page shows as-is.
 */

if (!isset($doc, $titles, $nums)) { http_response_code(404); exit; }
require __DIR__ . '/ask-claude.php';

// Opus, not Haiku like problem mode: it has to judge the student's own work
// line by line, and do the arithmetic correctly when asked. Low effort keeps a
// turn quick and cheap; this is short back-and-forth, not long reasoning.
const CHAT_MODEL        = 'claude-opus-5-5';
const CHAT_DAILY_LIMIT  = 200;     // turns per day, across everyone
const CHAT_MAX_MESSAGES = 40;      // a conversation this long is a new problem
const CHAT_MAX_CHARS    = 2000;    // per message

if ($_SERVER['REQUEST_METHOD'] !== 'POST') bail(405, 'Chat mode takes a POST.');

$in = json_decode(file_get_contents('php://input'), true);
$msgs = is_array($in) && isset($in['messages']) && is_array($in['messages']) ? $in['messages'] : null;
if (!$msgs) bail(400, 'Expected {"messages": [...]}.');
if (count($msgs) > CHAT_MAX_MESSAGES) bail(413, 'This conversation is long enough that it should be a new problem. Press New problem and start fresh.');

// Plain strings alternating user/assistant, starting and ending with the user.
// The page only ever sends that shape; anything else is refused, not repaired.
$clean = array();
foreach (array_values($msgs) as $i => $m) {
  $role = $i % 2 ? 'assistant' : 'user';
  if (!is_array($m) || !isset($m['role'], $m['content']) || $m['role'] !== $role || !is_string($m['content'])) {
    bail(400, 'Messages must alternate user/assistant, starting with the user.');
  }
  $text = trim($m['content']);
  if ($text === '') bail(400, 'Empty message.');
  if (strlen($text) > CHAT_MAX_CHARS) bail(413, 'That message is over ' . CHAT_MAX_CHARS . ' characters. Paste just the part you are stuck on.');
  $clean[] = array('role' => $role, 'content' => $text);
}
if (end($clean)['role'] !== 'user') bail(400, 'The last message must be yours.');

$key = apiKey();
if (!$key) bail(503, "Chat isn't set up on this server (no API key).");

$slot = countToday('chat-usage.json', CHAT_DAILY_LIMIT);
if ($slot === false) bail(503, "Can't write data/chat-usage.json, so chat is off (it's the spending cap). See README: chown www-data data.");
if ($slot === 'full') bail(429, 'Daily limit of ' . CHAT_DAILY_LIMIT . ' chat turns reached. It resets at midnight UTC.');

list(, $catalog) = catalog($doc, $titles, $nums);

$instructions = <<<TXT
You're tutoring a student who is working through pre-algebra and algebra with their own cheat sheet of rules. They bring a problem and work it with you over several turns. They're practising, so they do the computing; your job is to help them see which rule applies next, and where.

By default, name the rule that applies by its number, written exactly as "Rule 4.8" (the page turns that into a link to the rule), and point at the part of the problem it acts on. Then hand the step back to them. Don't state the result of a step or what an expression becomes, because working it out is the practice.

When they show their work, check it. If it's right, say so in a few words and point to the next rule. If it's wrong, name the rule they missed or misapplied and the spot where it went wrong, and let them redo it without giving the corrected value.

If they're stuck, give a stronger hint: the rule, exactly what to apply it to, and what kind of thing to do (e.g. "multiply the 3 into both terms in the parentheses"). Being stuck isn't a request for the answer.

Do the computation only when they explicitly ask you to: "compute it", "work it out", "show me", "what's the answer", "just do this step", and the like. Then do it correctly and in full, one step per line, each labelled with the rule it uses, so they can follow it and compare with their own work.

If a step needs something the sheet doesn't cover, say so plainly and name the idea, since the student adds rules to the sheet as they find gaps. If the message isn't about math, say this chat is for working problems.

Keep replies short, usually two to five lines. The chat shows plain text, so write math as plain text (x^2, x^(2/3), 3√125, (a+b)/c) with no LaTeX or markdown.

The cheat sheet:
TXT;

$body = array(
  'model'         => CHAT_MODEL,
  'max_tokens'    => 16000,
  'output_config' => array('effort' => 'low'),
  // If a safety classifier declines a turn, the API retries it on a fallback
  // model rather than leaving the student with a refusal.
  'fallbacks'     => 'default',
  'system'        => array(
    array('type' => 'text', 'text' => $instructions),
    array('type' => 'text', 'text' => $catalog, 'cache_control' => array('type' => 'ephemeral')),
  ),
  // Caches the conversation so far as well, since every turn resends all of it.
  'cache_control' => array('type' => 'ephemeral'),
  'messages'      => $clean,
);

$res = callClaude($key, $body, array('anthropic-beta: server-side-fallback-2026-07-01'), 'start a new problem.');

$reply = '';
foreach ($res['content'] as $block) {
  if ($block['type'] === 'text') $reply .= $block['text'];
}
if (trim($reply) === '') bail(502, "Claude didn't answer. Try again.");

header('Content-Type: application/json; charset=utf-8');
echo json_encode(array('reply' => trim($reply)));
