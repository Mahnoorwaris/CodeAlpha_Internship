/* Step 3 test suite: user profiles + suggestions
 * Run: node tests/users.test.js   (server must be running)
 * Self-contained: registers its own users with timestamped names (re-runnable)
 */
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
  console.log('\n=== STEP 3: USER PROFILE TESTS ===\n');
  const suffix = Date.now() % 1000000;
  const USER_C = `carol_${suffix}`;
  const USER_D = `dave_${suffix}`;
  const PASS_C = 'carl_pass_1';
  const PASS_D = 'dork_pass_2';

  // ---------- Setup ----------
  let r = await api('POST', '/api/auth/register', { name: 'Carol Devi', username: USER_C, email: `${USER_C}@test.com`, password: PASS_C });
  check('setup: register user C -> 201', r.status === 201, JSON.stringify(r.data));
  const tokenC = r.data.token;

  r = await api('POST', '/api/auth/register', { name: 'Dave Singh', username: USER_D, email: `${USER_D}@test.com`, password: PASS_D });
  check('setup: register user D -> 201', r.status === 201, JSON.stringify(r.data));
  const tokenD = r.data.token;

  // ---------- GET public profile ----------
  console.log('[GET /api/users/:username] public profile');
  r = await api('GET', `/api/users/${USER_C}`);
  check('public profile -> 200 (no token)', r.status === 200, `got ${r.status}`);
  const p = (r.data && r.data.profile) || {};
  check('profile has name/username/picture/bio', ['name', 'username', 'profilePicture', 'bio'].every((k) => k in p));
  check('profile has followersCount & followingCount', typeof p.followersCount === 'number' && typeof p.followingCount === 'number');
  check('counts start at 0', p.followersCount === 0 && p.followingCount === 0);
  check('no password field in response', !JSON.stringify(r.data).includes(PASS_C) && !('password' in p));

  r = await api('GET', '/api/users/nonexistent_user_zz');
  check('unknown username -> 404', r.status === 404);

  r = await api('GET', `/api/users/${USER_C.toUpperCase()}`);
  check('case-insensitive lookup (UPPERCASE) -> 200', r.status === 200 && r.data.profile && r.data.profile.username === USER_C, `got ${r.status}`);

  const mixedCase = USER_C.charAt(0).toUpperCase() + USER_C.slice(1);
  r = await api('GET', `/api/users/${mixedCase}`);
  check('case-insensitive lookup (mixed case) -> 200', r.status === 200 && r.data.profile && r.data.profile.username === USER_C, `got ${r.status}`);

  // ---------- PUT own profile ----------
  console.log('[PUT /api/users/profile]');
  r = await api('PUT', '/api/users/profile', { name: 'Carol Updated', bio: 'Full-stack learner', profilePicture: 'https://example.com/carol.png' });
  check('update without token -> 401', r.status === 401);

  r = await api('PUT', '/api/users/profile', { name: 'X' }, 'garbage.token.here');
  check('update with invalid token -> 401', r.status === 401);

  r = await api('PUT', '/api/users/profile', { name: 'Carol Updated', bio: 'Full-stack learner', profilePicture: 'https://example.com/carol.png' }, tokenC);
  check('valid update -> 200', r.status === 200, `got ${r.status} ${JSON.stringify(r.data)}`);
  check('response reflects new values', r.data.user && r.data.user.name === 'Carol Updated' && r.data.user.bio === 'Full-stack learner');
  check('no password in update response', !JSON.stringify(r.data).includes(PASS_C));

  r = await api('GET', `/api/users/${USER_C}`);
  check('GET verifies persisted update -> 200', r.status === 200 && r.data.profile.name === 'Carol Updated' && r.data.profile.bio === 'Full-stack learner');

  console.log('[PUT validation]');
  r = await api('PUT', '/api/users/profile', {}, tokenC);
  check('empty update body -> 400', r.status === 400);

  r = await api('PUT', '/api/users/profile', { name: 'A' }, tokenC);
  check('too-short name -> 400', r.status === 400);

  r = await api('PUT', '/api/users/profile', { bio: 'x'.repeat(201) }, tokenC);
  check('bio > 200 chars -> 400', r.status === 400);

  r = await api('PUT', '/api/users/profile', { username: 'Bad User!' }, tokenC);
  check('invalid username format -> 400', r.status === 400);

  console.log('[duplicate username prevention]');
  r = await api('PUT', '/api/users/profile', { username: USER_D }, tokenC);
  check('take other user\'s username -> 409', r.status === 409, `got ${r.status}`);

  r = await api('PUT', '/api/users/profile', { username: USER_D.toUpperCase() }, tokenC);
  check('case-insensitive duplicate -> 409', r.status === 409);

  r = await api('PUT', '/api/users/profile', { username: USER_C }, tokenC);
  check('keep own username -> 200 (self allowed)', r.status === 200, `got ${r.status}`);

  console.log('[email/password immutability]');
  r = await api('PUT', '/api/users/profile', {
    name: 'Carol Again',
    email: `evil_${suffix}@test.com`,
    password: 'hacked_pass_9',
  }, tokenC);
  check('email/password in body ignored -> 200 (other fields update)', r.status === 200 && r.data.user && r.data.user.name === 'Carol Again', `got ${r.status}`);

  r = await api('POST', '/api/auth/login', { email: `${USER_C}@test.com`, password: PASS_C });
  check('password unchanged (old password still logs in)', r.status === 200);

  r = await api('POST', '/api/auth/register', { name: 'Dup Check', username: `dupchk_${suffix}`, email: `${USER_C}@test.com`, password: 'whatever1' });
  check('email unchanged (still registered to Carol)', r.status === 409);

  // ---------- Suggestions ----------
  console.log('[GET /api/users/suggestions]');
  r = await api('GET', '/api/users/suggestions');
  check('suggestions without token -> 401', r.status === 401);

  r = await api('GET', '/api/users/suggestions', null, 'not.a.jwt');
  check('suggestions invalid token -> 401', r.status === 401);

  r = await api('GET', '/api/users/suggestions', null, tokenC);
  check('suggestions -> 200 with token', r.status === 200, `got ${r.status}`);
  const list = (r.data && r.data.users) || [];
  check('list contains user D', list.some((u) => u.username === USER_D));
  check('logged-in user C excluded from own list', !list.some((u) => u.username === USER_C));
  check('no password fields anywhere in list', !JSON.stringify(list).includes(PASS_D) && list.every((u) => !('password' in u)));
  check('each entry has followersCount', list.every((u) => typeof u.followersCount === 'number'));

  // ---------- SUMMARY ----------
  console.log('\n=== RESULTS ===');
  console.log(`PASS: ${pass}   FAIL: ${fail}`);
  if (fail) {
    console.log('Failures:', failures.join(' | '));
    process.exit(1);
  }
})();
