/* Step 4 test suite: follow / unfollow system
 * Run: node tests/follow.test.js   (server must be running)
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
  console.log('\n=== STEP 4: FOLLOW/UNFOLLOW TESTS ===\n');
  const suffix = Date.now() % 1000000;
  const USER_G = `gita_${suffix}`;
  const USER_H = `hari_${suffix}`;
  const USER_T = `tara_${suffix}`;
  const PASS_G = 'gita_pass_1';

  // ---------- Setup ----------
  let r = await api('POST', '/api/auth/register', { name: 'Gita Rao', username: USER_G, email: `${USER_G}@test.com`, password: PASS_G });
  check('setup: register user G -> 201', r.status === 201, JSON.stringify(r.data));
  const tokenG = r.data.token;
  const idG = r.data.user.id;

  r = await api('POST', '/api/auth/register', { name: 'Hari Verma', username: USER_H, email: `${USER_H}@test.com`, password: 'hari_pass_2' });
  check('setup: register user H -> 201', r.status === 201);
  const tokenH = r.data.token;
  const idH = r.data.user.id;

  r = await api('POST', '/api/auth/register', { name: 'Tara Sen', username: USER_T, email: `${USER_T}@test.com`, password: 'tara_pass_3' });
  check('setup: register user T -> 201', r.status === 201);
  const tokenT = r.data.token;

  // ---------- Guard rails ----------
  console.log('[guard rails]');
  r = await api('POST', `/api/users/${idH}/follow`);
  check('follow without token -> 401', r.status === 401, `got ${r.status}`);

  r = await api('POST', `/api/users/${idH}/follow`, null, 'garbage.token.value');
  check('follow invalid token -> 401', r.status === 401);

  r = await api('DELETE', `/api/users/${idH}/follow`, null, 'not.a.jwt');
  check('unfollow invalid token -> 401', r.status === 401);

  r = await api('DELETE', `/api/users/${idH}/follow`);
  check('unfollow without token -> 401', r.status === 401, `got ${r.status}`);

  r = await api('POST', `/api/users/${idG}/follow`, null, tokenG);
  check('self-follow -> 400', r.status === 400, `got ${r.status}`);

  r = await api('DELETE', `/api/users/${idG}/follow`, null, tokenG);
  check('self-unfollow -> 400', r.status === 400);

  r = await api('POST', '/api/users/not-a-valid-id/follow', null, tokenG);
  check('follow invalid user ID format -> 400', r.status === 400, `got ${r.status}`);

  const ghostId = crypto.randomBytes(12).toString('hex');
  r = await api('POST', `/api/users/${ghostId}/follow`, null, tokenG);
  check('follow nonexistent user -> 404', r.status === 404, `got ${r.status}`);

  // ---------- Follow happy path ----------
  console.log('[POST follow] G follows H');
  r = await api('POST', `/api/users/${idH}/follow`, null, tokenG);
  check('G follows H -> success (200)', r.status === 200, `got ${r.status} ${JSON.stringify(r.data)}`);
  check('response returns followingCount for G', r.data && r.data.followingCount === 1, JSON.stringify(r.data));
  check('response returns followersCount for H', r.data && r.data.followersCount === 1);

  r = await api('GET', `/api/users/${USER_H}`);
  check('DB-backed verify: H followersCount = 1', r.data.profile && r.data.profile.followersCount === 1, JSON.stringify(r.data));
  check('profile exposes counts but never password', r.data.profile && !('password' in r.data.profile));

  r = await api('GET', `/api/users/${USER_G}`);
  check('DB-backed verify: G followingCount = 1', r.data.profile && r.data.profile.followingCount === 1);

  console.log('[duplicate follow]');
  r = await api('POST', `/api/users/${idH}/follow`, null, tokenG);
  check('duplicate follow -> rejected (409)', r.status === 409, `got ${r.status} ${JSON.stringify(r.data)}`);

  r = await api('GET', `/api/users/${USER_H}`);
  check('duplicate attempt did not double-add', r.data.profile.followersCount === 1);

  console.log('[suggestions respect follow graph]');
  r = await api('GET', '/api/users/suggestions', null, tokenG);
  check('suggestions with valid token -> 200', r.status === 200, `got ${r.status}`);
  const sug = (r.data && r.data.users) || [];
  check('suggestions exclude followed user H', !sug.some((u) => u.username === USER_H));
  check('suggestions exclude current user G', !sug.some((u) => u.username === USER_G));
  check('suggestions still include unfollowed user T', sug.some((u) => u.username === USER_T));

  console.log('[reverse direction]');
  r = await api('POST', `/api/users/${idG}/follow`, null, tokenH);
  check('H follows G -> success', r.status === 200 && r.data.followingCount === 1 && r.data.followersCount === 1, JSON.stringify(r.data));

  // ---------- Multi-user counts ----------
  console.log('[counts with third user]');
  r = await api('POST', `/api/users/${idG}/follow`, null, tokenT);
  check('T follows G -> success', r.status === 200 && r.data.followingCount === 1, JSON.stringify(r.data));
  check('G now has 2 followers', r.data.followersCount === 2);

  r = await api('GET', `/api/users/${USER_G}`);
  check('persisted: G followersCount = 2, followingCount = 1', r.data.profile.followersCount === 2 && r.data.profile.followingCount === 1);

  // ---------- Unfollow ----------
  console.log('[DELETE unfollow] G unfollows H');
  r = await api('DELETE', `/api/users/${idH}/follow`, null, tokenG);
  check('G unfollows H -> success (200)', r.status === 200, `got ${r.status} ${JSON.stringify(r.data)}`);
  check('unfollow response: G followingCount back to 0', r.data.followingCount === 0);
  check('unfollow response: H followersCount back to 0', r.data.followersCount === 0);

  r = await api('GET', `/api/users/${USER_H}`);
  check('persisted: H followers removed (0)', r.data.profile.followersCount === 0);

  r = await api('GET', `/api/users/${USER_G}`);
  check('persisted: G following removed (0)', r.data.profile.followingCount === 0);
  check('other relationships untouched (G followers still 2)', r.data.profile.followersCount === 2);

  console.log('[unfollow edge cases]');
  r = await api('DELETE', `/api/users/${idH}/follow`, null, tokenG);
  check('unfollow when not following -> 409', r.status === 409, `got ${r.status}`);

  r = await api('DELETE', `/api/users/${ghostId}/follow`, null, tokenG);
  check('unfollow nonexistent user -> 404', r.status === 404);

  r = await api('DELETE', '/api/users/bad-id/follow', null, tokenG);
  check('unfollow invalid ID format -> 400', r.status === 400);

  r = await api('DELETE', `/api/users/${idG}/follow`, null, tokenH);
  check('H unfollows G -> both sides cleaned', r.status === 200 && r.data.followingCount === 0 && r.data.followersCount === 1, JSON.stringify(r.data));

  // ---------- Security ----------
  console.log('[security]');
  r = await api('GET', `/api/users/${USER_G}`);
  check('no raw password in any profile response', !JSON.stringify(r.data).toLowerCase().includes(PASS_G));

  // ---------- SUMMARY ----------
  console.log('\n=== RESULTS ===');
  console.log(`PASS: ${pass}   FAIL: ${fail}`);
  if (fail) {
    console.log('Failures:', failures.join(' | '));
    process.exit(1);
  }
})();
