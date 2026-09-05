/* Step 7 test suite: comments system
 * Run: node tests/comments.test.js   (server must be running)
 * Self-contained: registers its own users with timestamped names (re-runnable)
 */
const crypto = require('crypto');
const BASE = process.env.BASE_URL || 'http://localhost:3000';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL  ${name}${extra ? ' -> ' + extra : ''}`);
  }
}

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  console.log('\n=== STEP 7: COMMENTS TESTS ===\n');
  const suffix = Date.now() % 1000000;
  const USER_N = `nina_${suffix}`;
  const USER_O = `omar_${suffix}`;
  const PASS_N = 'nina_pass_1';

  // ---------- Setup ----------
  let r = await api('POST', '/api/auth/register', { name: 'Nina Sethi', username: USER_N, email: `${USER_N}@test.com`, password: PASS_N });
  check('setup: register user A -> 201', r.status === 201, JSON.stringify(r.data));
  const tokenA = r.data.token;

  r = await api('POST', '/api/auth/register', { name: 'Omar Farooq', username: USER_O, email: `${USER_O}@test.com`, password: 'omar_pass_2' });
  check('setup: register user B -> 201', r.status === 201);
  const tokenB = r.data.token;

  r = await api('POST', '/api/posts', { content: `Comment-target post by ${USER_N}` }, tokenA);
  check('setup: create post -> 201', r.status === 201);
  const postId = r.data.post.id;

  // ---------- ADD ----------
  console.log('[POST comments] add');
  r = await api('POST', `/api/posts/${postId}/comments`, { content: 'First comment from A' }, tokenA);
  check('add comment -> 201', r.status === 201, `got ${r.status} ${JSON.stringify(r.data)}`);
  check('comment echoes content + id', r.data.comment && r.data.comment.content === 'First comment from A' && !!r.data.comment.id);
  check('author info present without email/password', r.data.comment.author && r.data.comment.author.username === USER_N && !('password' in r.data.comment.author) && !('email' in r.data.comment.author));
  check('comment has createdAt & updatedAt', !!(r.data.comment.createdAt && r.data.comment.updatedAt));
  const commentA1 = r.data.comment.id;

  await sleep(20);
  r = await api('POST', `/api/posts/${postId}/comments`, { content: 'Comment from B' }, tokenB);
  check('user B adds comment -> 201', r.status === 201);
  const commentB1 = r.data.comment.id;

  await sleep(20);
  r = await api('POST', `/api/posts/${postId}/comments`, { content: 'Second comment from A' }, tokenA);
  check('third comment added -> 201', r.status === 201);
  const commentA2 = r.data.comment.id;

  console.log('[add validation]');
  r = await api('POST', `/api/posts/${postId}/comments`, { content: '' }, tokenA);
  check('empty comment -> 400', r.status === 400);

  r = await api('POST', `/api/posts/${postId}/comments`, { content: '   ' }, tokenA);
  check('whitespace-only comment -> 400', r.status === 400);

  r = await api('POST', `/api/posts/${postId}/comments`, {}, tokenA);
  check('missing content -> 400', r.status === 400);

  r = await api('POST', `/api/posts/${postId}/comments`, { content: 'x'.repeat(501) }, tokenA);
  check('content > 500 chars -> 400', r.status === 400);

  r = await api('POST', `/api/posts/${postId}/comments`, { content: 'no token' });
  check('no-token add -> 401', r.status === 401, `got ${r.status}`);

  r = await api('POST', `/api/posts/${postId}/comments`, { content: 'bad token' }, 'garbage.token.value');
  check('invalid-token add -> 401', r.status === 401);

  const ghostPostId = crypto.randomBytes(12).toString('hex');
  r = await api('POST', `/api/posts/${ghostPostId}/comments`, { content: 'ghost' }, tokenA);
  check('comment on missing post -> 404', r.status === 404, `got ${r.status}`);

  r = await api('POST', '/api/posts/bad-id/comments', { content: 'x' }, tokenA);
  check('add with bad post ID format -> 400', r.status === 400);

  // ---------- LIST ----------
  console.log('[GET comments] list');
  r = await api('GET', `/api/posts/${postId}/comments`);
  check('list comments -> 200 (public, no token)', r.status === 200, `got ${r.status}`);
  check('list returns count matching array', r.data.count === 3 && Array.isArray(r.data.comments) && r.data.comments.length === 3);
  const order = r.data.comments.map((c) => c.id);
  check('comments sorted newest first', order[0] === commentA2 && order[1] === commentB1 && order[2] === commentA1, JSON.stringify(order));
  check('every listed comment has author username', r.data.comments.every((c) => c.author && c.author.username));
  check('no password material anywhere in list', !JSON.stringify(r.data).toLowerCase().includes(PASS_N));

  r = await api('GET', `/api/posts/${ghostPostId}/comments`);
  check('list for missing post -> 404', r.status === 404);

  r = await api('GET', '/api/posts/bad-id/comments');
  check('list with bad post ID format -> 400', r.status === 400);

  // ---------- EDIT ----------
  console.log('[PUT /api/comments/:id] edit');
  r = await api('PUT', `/api/comments/${commentA1}`, { content: 'hijack by B' }, tokenB);
  check('non-owner edit -> 403', r.status === 403, `got ${r.status}`);

  r = await api('GET', `/api/posts/${postId}/comments`);
  check('403 edit left comment unchanged', r.data.comments.find((c) => c.id === commentA1).content === 'First comment from A');

  r = await api('PUT', `/api/comments/${commentA1}`, { content: 'edited' });
  check('edit without token -> 401', r.status === 401);

  r = await api('PUT', `/api/comments/${commentA1}`, { content: 'edited' }, 'not.a.jwt');
  check('edit invalid token -> 401', r.status === 401);

  r = await api('PUT', `/api/comments/${commentA1}`, { content: '' }, tokenA);
  check('edit to empty content -> 400', r.status === 400);

  r = await api('PUT', '/api/comments/bad-id', { content: 'x' }, tokenA);
  check('edit bad comment ID format -> 400', r.status === 400);

  r = await api('PUT', `/api/comments/${ghostPostId}`, { content: 'x' }, tokenA);
  check('edit missing comment -> 404', r.status === 404);

  r = await api('PUT', `/api/comments/${commentA1}`, { content: 'First comment from A (edited)' }, tokenA);
  check('owner edit -> 200', r.status === 200, `got ${r.status} ${JSON.stringify(r.data)}`);
  check('edit response reflects new content', r.data.comment && r.data.comment.content === 'First comment from A (edited)');

  r = await api('GET', `/api/posts/${postId}/comments`);
  check('DB-backed verify: edited content persisted', r.data.comments.find((c) => c.id === commentA1).content === 'First comment from A (edited)');
  check('updatedAt advanced after edit', new Date(r.data.comments.find((c) => c.id === commentA1).updatedAt).getTime() >= new Date(r.data.comments.find((c) => c.id === commentA1).createdAt).getTime());

  // ---------- DELETE ----------
  console.log('[DELETE /api/comments/:id]');
  r = await api('DELETE', `/api/comments/${commentA2}`, null, tokenB);
  check('non-owner delete -> 403', r.status === 403);

  r = await api('DELETE', `/api/comments/${commentA2}`);
  check('delete without token -> 401', r.status === 401);

  r = await api('DELETE', `/api/comments/${commentA2}`, null, 'garbage.token');
  check('delete invalid token -> 401', r.status === 401);

  r = await api('DELETE', '/api/comments/bad-id', null, tokenA);
  check('delete bad comment ID format -> 400', r.status === 400);

  r = await api('DELETE', `/api/comments/${ghostPostId}`, null, tokenA);
  check('delete missing comment -> 404', r.status === 404);

  r = await api('DELETE', `/api/comments/${commentA2}`, null, tokenA);
  check('owner delete -> 200', r.status === 200, `got ${r.status} ${JSON.stringify(r.data)}`);

  r = await api('GET', `/api/posts/${postId}/comments`);
  check('deleted comment gone from list (count 2)', r.data.count === 2 && !r.data.comments.some((c) => c.id === commentA2));

  r = await api('DELETE', `/api/comments/${commentA2}`, null, tokenA);
  check('delete same comment again -> 404', r.status === 404);

  // ---------- Cascade ----------
  console.log('[cascade on post delete]');
  r = await api('POST', '/api/posts', { content: 'post to be deleted' }, tokenB);
  const doomedPostId = r.data.post.id;
  await api('POST', `/api/posts/${doomedPostId}/comments`, { content: 'orphan-to-be' }, tokenA);
  r = await api('DELETE', `/api/posts/${doomedPostId}`, null, tokenB);
  check('deleting post succeeds -> 200', r.status === 200);
  r = await api('GET', `/api/posts/${doomedPostId}/comments`);
  check('comments of deleted post no longer reachable -> 404', r.status === 404);

  // ---------- SUMMARY ----------
  console.log('\n=== RESULTS ===');
  console.log(`PASS: ${pass}   FAIL: ${fail}`);
  if (fail) {
    console.log('Failures:', failures.join(' | '));
    process.exit(1);
  }
})();
