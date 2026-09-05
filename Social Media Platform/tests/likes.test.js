/* Step 6 test suite: post likes / unlike
 * Run: node tests/likes.test.js   (server must be running)
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

(async () => {
  console.log('\n=== STEP 6: POST LIKES TESTS ===\n');
  const suffix = Date.now() % 1000000;
  const USER_L = `lia_${suffix}`;
  const USER_M = `moe_${suffix}`;

  // ---------- Setup ----------
  let r = await api('POST', '/api/auth/register', { name: 'Lia Ahmed', username: USER_L, email: `${USER_L}@test.com`, password: 'lia_pass_1' });
  check('setup: register user A -> 201', r.status === 201, JSON.stringify(r.data));
  const tokenA = r.data.token;

  r = await api('POST', '/api/auth/register', { name: 'Moe Iqbal', username: USER_M, email: `${USER_M}@test.com`, password: 'moe_pass_2' });
  check('setup: register user B -> 201', r.status === 201);
  const tokenB = r.data.token;

  r = await api('POST', '/api/posts', { content: `Like-target post by ${USER_L}` }, tokenA);
  check('setup: user A creates a post -> 201', r.status === 201 && r.data.post.likesCount === 0, JSON.stringify(r.data));
  const postId = r.data.post.id;

  // ---------- Like flow ----------
  console.log('[like flow]');
  r = await api('POST', `/api/posts/${postId}/like`, null, tokenA);
  check('user A likes the post -> success', r.status === 200, `got ${r.status} ${JSON.stringify(r.data)}`);
  check('likesCount returned as 1', r.data && r.data.likesCount === 1);

  r = await api('GET', `/api/posts/${postId}`);
  check('DB-backed verify: likesCount = 1 after like', r.data.post && r.data.post.likesCount === 1, JSON.stringify(r.data));

  r = await api('POST', `/api/posts/${postId}/like`, null, tokenA);
  check('duplicate like -> rejected (409)', r.status === 409, `got ${r.status} ${JSON.stringify(r.data)}`);

  r = await api('GET', `/api/posts/${postId}`);
  check('duplicate like did not double-count', r.data.post.likesCount === 1);

  r = await api('POST', `/api/posts/${postId}/like`, null, tokenB);
  check('user B likes the post -> likesCount 2', r.status === 200 && r.data.likesCount === 2, `got ${r.status} ${JSON.stringify(r.data)}`);

  // ---------- Unlike flow ----------
  console.log('[unlike flow]');
  r = await api('DELETE', `/api/posts/${postId}/like`, null, tokenA);
  check('user A unlikes -> likesCount 1', r.status === 200 && r.data.likesCount === 1, `got ${r.status} ${JSON.stringify(r.data)}`);

  r = await api('DELETE', `/api/posts/${postId}/like`, null, tokenB);
  check('user B unlikes -> likesCount 0', r.status === 200 && r.data.likesCount === 0, `got ${r.status} ${JSON.stringify(r.data)}`);

  r = await api('GET', `/api/posts/${postId}`);
  check('DB-backed verify: likesCount back to 0', r.data.post.likesCount === 0);

  r = await api('DELETE', `/api/posts/${postId}/like`, null, tokenA);
  check('unlike when not liked handled safely (409)', r.status === 409, `got ${r.status}`);
  check('safety response never crashes server shape', r.data && r.data.success === false && !!r.data.message);

  // re-like cycle keeps array clean
  r = await api('POST', `/api/posts/${postId}/like`, null, tokenB);
  check('re-like after unlike works', r.status === 200 && r.data.likesCount === 1);
  r = await api('DELETE', `/api/posts/${postId}/like`, null, tokenB);
  check('re-unlike cleans up again', r.status === 200 && r.data.likesCount === 0);

  // ---------- Auth guards ----------
  console.log('[auth guards]');
  r = await api('POST', `/api/posts/${postId}/like`);
  check('no-token like -> 401', r.status === 401, `got ${r.status}`);

  r = await api('POST', `/api/posts/${postId}/like`, null, 'garbage.token.value');
  check('invalid-token like -> 401', r.status === 401);

  r = await api('DELETE', `/api/posts/${postId}/like`);
  check('no-token unlike -> 401', r.status === 401);

  r = await api('DELETE', `/api/posts/${postId}/like`, null, 'not.a.jwt');
  check('invalid-token unlike -> 401', r.status === 401);

  // ---------- Post existence / ID guards ----------
  console.log('[post guards]');
  const ghostId = crypto.randomBytes(12).toString('hex');
  r = await api('POST', `/api/posts/${ghostId}/like`, null, tokenA);
  check('like non-existent post -> 404', r.status === 404, `got ${r.status}`);

  r = await api('DELETE', `/api/posts/${ghostId}/like`, null, tokenA);
  check('unlike non-existent post -> 404', r.status === 404);

  r = await api('POST', '/api/posts/bad-id/like', null, tokenA);
  check('like invalid ID format -> 400', r.status === 400);

  r = await api('DELETE', '/api/posts/bad-id/like', null, tokenA);
  check('unlike invalid ID format -> 400', r.status === 400);

  // feed still exposes likesCount correctly
  r = await api('GET', '/api/posts');
  const feedEntry = (r.data.posts || []).find((p) => p.id === postId);
  check('feed entry reflects final likesCount 0 with author info', !!feedEntry && feedEntry.likesCount === 0 && !!feedEntry.author.username);

  // ---------- SUMMARY ----------
  console.log('\n=== RESULTS ===');
  console.log(`PASS: ${pass}   FAIL: ${fail}`);
  if (fail) {
    console.log('Failures:', failures.join(' | '));
    process.exit(1);
  }
})();
