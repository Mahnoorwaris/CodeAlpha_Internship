/* Auth test suite: /api/auth/register | login | me
 * Run: node tests/auth.test.js   (server must be running on :3000)
 * Uses unique-per-run usernames/emails so it is safe to re-run
 * against a persistent database (e.g. MongoDB Atlas).
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000';

// Unique suffix per run - keeps duplicate tests meaningful without
// colliding with data left over from previous runs
const SUF = Date.now().toString(36);
const ALICE_USER = `alice_${SUF}`;
const ALICE_EMAIL = `alice_${SUF}@example.com`;
const BOB_USER = `bob_${SUF}`;
const BOB_EMAIL = `bob_${SUF}@example.com`;
const ALICE_PASS = 'secret123';

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
  console.log('\n=== AUTH TESTS ===\n');

  // ---------- REGISTER ----------
  console.log('[register] valid case');
  let r = await api('POST', '/api/auth/register', {
    name: 'Alice Khan',
    username: ALICE_USER,
    email: ALICE_EMAIL,
    password: ALICE_PASS,
  });
  check('valid register -> 201', r.status === 201, `got ${r.status} ${JSON.stringify(r.data)}`);
  check('register returns token', !!(r.data && r.data.token));
  check('register returns user object', !!(r.data && r.data.user && r.data.user.username === ALICE_USER));
  check('user has createdAt', !!(r.data && r.data.user && r.data.user.createdAt));
  check('register response has no password key', !!(r.data && r.data.user) && !('password' in r.data.user));
  check('register response never leaks plaintext password', !JSON.stringify(r.data || {}).includes(ALICE_PASS));

  r = await api('POST', '/api/auth/register', {
    name: 'Bob Ali',
    username: BOB_USER,
    email: BOB_EMAIL,
    password: 'hunter22',
  });
  check('second user registers -> 201', r.status === 201, `got ${r.status}`);

  console.log('[register] duplicate prevention');
  r = await api('POST', '/api/auth/register', {
    name: 'Alice Clone',
    username: `clone_${SUF}`,
    email: ALICE_EMAIL,
    password: 'whatever1',
  });
  check('duplicate email -> 409', r.status === 409, `got ${r.status}`);
  check('duplicate email message mentions Email', /email/i.test(r.data && r.data.message));

  r = await api('POST', '/api/auth/register', {
    name: 'Alice Clone 2',
    username: ALICE_USER.toUpperCase(), // case-insensitive match
    email: `other_${SUF}@example.com`,
    password: 'whatever1',
  });
  check('duplicate username (case-insensitive) -> 409', r.status === 409, `got ${r.status}`);
  check('duplicate username message mentions Username', /username/i.test(r.data && r.data.message));

  console.log('[register] validation');
  r = await api('POST', '/api/auth/register', { username: 'x1', email: 'a@b.com', password: '123456' });
  check('missing fields (name) -> 400', r.status === 400);
  check('error lists missing field name', /name/i.test(r.data && r.data.message));

  r = await api('POST', '/api/auth/register', {});
  check('empty body -> 400 with field list', r.status === 400 && /name/i.test(r.data.message));

  r = await api('POST', '/api/auth/register', {
    name: 'A B',
    username: `ok_user_${SUF}`,
    email: 'not-an-email',
    password: '123456',
  });
  check('invalid email format -> 400', r.status === 400);

  r = await api('POST', '/api/auth/register', {
    name: 'A B',
    username: `ok_user2_${SUF}`,
    email: `ok_${SUF}@ex.com`,
    password: '12345',
  });
  check('short password (<6) -> 400', r.status === 400);

  // ---------- LOGIN ----------
  console.log('[login]');
  r = await api('POST', '/api/auth/login', { email: ALICE_EMAIL, password: ALICE_PASS });
  check('valid login -> 200 + token', r.status === 200 && !!r.data.token, `got ${r.status}`);
  check('login returns safe user object', !!(r.data.user && r.data.user.email === ALICE_EMAIL));
  const aliceToken = r.data.token;

  r = await api('POST', '/api/auth/login', { email: ALICE_EMAIL, password: 'WRONG_pass' });
  check('wrong password -> 401', r.status === 401);
  check('generic error message (no hint which field wrong)', /invalid email or password/i.test(r.data.message));

  r = await api('POST', '/api/auth/login', { email: `ghost_${SUF}@example.com`, password: 'irrelevant' });
  check('unknown email -> 401 (same generic msg)', r.status === 401 && /invalid email or password/i.test(r.data.message));

  // ---------- PASSWORD NEVER RETURNED ----------
  console.log('[password exposure]');

  r = await api('GET', '/api/auth/me', null, aliceToken);
  const meUser = r.data && r.data.user;
  check('/me response has no password key', !!meUser && !('password' in meUser));
  r = await api('POST', '/api/auth/login', { email: ALICE_EMAIL, password: ALICE_PASS });
  check('login response has no password key', !!(r.data && r.data.user) && !('password' in r.data.user));
  check('responses never leak plaintext password', !JSON.stringify(r.data || {}).includes(ALICE_PASS));

  // ---------- ME ----------
  console.log('[me]');
  r = await api('GET', '/api/auth/me', null, aliceToken);
  check('/me with valid token -> 200', r.status === 200, `got ${r.status}`);
  check('/me returns correct user', r.data.user && r.data.user.username === ALICE_USER);
  check('/me includes profile fields', 'profilePicture' in r.data.user && 'bio' in r.data.user);

  r = await api('GET', '/api/auth/me');
  check('/me without token -> 401', r.status === 401);

  r = await api('GET', '/api/auth/me', null, 'garbage.token.value');
  check('/me garbage token -> 401 invalid', r.status === 401);

  // Token signed with wrong secret (tampered signature)
  const forged =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjAwMDBmYWtlIn0.fakesig_fakesig_fakesig';
  r = await api('GET', '/api/auth/me', null, forged);
  check('/me tampered token -> 401', r.status === 401);

  // Valid-format token tampered AFTER signing (payload altered, sig kept)
  if (aliceToken) {
    const parts = aliceToken.split('.');
    const payload = Buffer.from(parts[1], 'base64').toString();
    const hacked = Buffer.from(payload.replace(/"id":"[^"]*"/, '"id":"000000000000000000000000"')).toString('base64').replace(/=/g, '');
    r = await api('GET', '/api/auth/me', null, `${parts[0]}.${hacked}.${parts[2]}`);
    check('/me payload-tampered token -> 401', r.status === 401, `got ${r.status}`);
  }

  // ---------- SUMMARY ----------
  console.log('\n=== RESULTS ===');
  console.log(`PASS: ${pass}   FAIL: ${fail}`);
  if (fail) {
    console.log('Failures:', failures.join(' | '));
    process.exit(1);
  }
})();
