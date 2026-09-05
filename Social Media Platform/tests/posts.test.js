/* Step 4 test suite: posts system (create/feed/get/update/delete)
 * Run: node tests/posts.test.js   (server must be running)
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
  console.log('\n=== STEP 4: POSTS TESTS ===\n');
  const suffix = Date.now() % 1000000;
  const USER_E = `erin_${suffix}`;
  const USER_F = `frank_${suffix}`;
  const PASS_E = 'erin_pass_1';
  const PASS_F = 'frank_pass_2';

  // ---------- Setup ----------
  let r = await api('POST', '/api/auth/register', { name: 'Erin Khan', username: USER_E, email: `${USER_E}@test.com`, password: PASS_E });
  check('setup: register user E -> 201', r.status === 201, JSON.stringify(r.data));
  const tokenE = r.data.token;

  r = await api('POST', '/api/auth/register', { name: 'Frank Malik', username: USER_F, email: `${USER_F}@test.com`, password: PASS_F });
  check('setup: register user F -> 201', r.status === 201, JSON.stringify(r.data));
  const tokenF = r.data.token;
  const idF = r.data.user && r.data.user.id;

  // ---------- CREATE ----------
  console.log('[POST /api/posts] create');
  r = await api('POST', '/api/posts', { content: 'Hello world! My first post.' }, tokenE);
  check('create post -> 201', r.status === 201, `got ${r.status} ${JSON.stringify(r.data)}`);
  check('create returns post id', !!(r.data && r.data.post && r.data.post.id));
  check('create echoes content trimmed', r.data.post && r.data.post.content === 'Hello world! My first post.');
  check('post has author info with username', !!(r.data.post && r.data.post.author && r.data.post.author.username === USER_E));
  check('author object has no password/email fields', r.data.post && r.data.post.author && !('password' in r.data.post.author) && !('email' in r.data.post.author));
  check('post has createdAt & updatedAt', !!(r.data.post && r.data.post.createdAt && r.data.post.updatedAt));
  check('likesCount starts at 0', r.data.post && r.data.post.likesCount === 0);
  const postId1 = r.data.post && r.data.post.id;

  r = await api('POST', '/api/posts', { content: 'Post with an image', imageUrl: 'https://example.com/pic.png' }, tokenE);
  check('create post with optional imageUrl -> 201', r.status === 201 && r.data.post.imageUrl === 'https://example.com/pic.png', `got ${r.status}`);

  console.log('[POST /api/posts] validation + auth');
  r = await api('POST', '/api/posts', { content: '' }, tokenE);
  check('empty content -> 400', r.status === 400, `got ${r.status}`);

  r = await api('POST', '/api/posts', { content: '   ' }, tokenE);
  check('whitespace-only content -> 400', r.status === 400);

  r = await api('POST', '/api/posts', {}, tokenE);
  check('missing content -> 400', r.status === 400);

  r = await api('POST', '/api/posts', { imageUrl: 'https://example.com/x.png' }, tokenE);
  check('imageUrl without content -> 400', r.status === 400);

  r = await api('POST', '/api/posts', { content: 'x'.repeat(2001) }, tokenE);
  check('content > 2000 chars -> 400', r.status === 400);

  r = await api('POST', '/api/posts', { content: 'no token here' });
  check('no-token create -> 401', r.status === 401, `got ${r.status}`);

  r = await api('POST', '/api/posts', { content: 'bad token' }, 'garbage.token.value');
  check('invalid-token create -> 401', r.status === 401);

  r = await api('POST', '/api/posts', { content: 'no password leak', imageUrl: 'x' }, tokenF);
  check('response never contains raw passwords/secrets', !JSON.stringify(r.data).toLowerCase().includes(PASS_F));

  console.log('[POST /api/posts] client-supplied author rejected');
  r = await api('POST', '/api/posts', { content: 'Author spoof attempt', author: idF }, tokenE);
  check('create with spoofed author field -> 201', r.status === 201, `got ${r.status}`);
  check('post author is authenticated user E, not spoofed F', r.data.post && r.data.post.author && r.data.post.author.username === USER_E, JSON.stringify(r.data.post && r.data.post.author));
  if (r.data && r.data.post && r.data.post.id) {
    await api('DELETE', `/api/posts/${r.data.post.id}`, null, tokenE); // tidy up
  }

  // ---------- FEED ----------
  console.log('[GET /api/posts] feed');
  await sleep(30);
  r = await api('POST', '/api/posts', { content: `Newest post by ${USER_F} at ${Date.now()}` }, tokenF);
  check('setup: second author creates post -> 201', r.status === 201);
  const postIdNewest = r.data.post && r.data.post.id;
  await sleep(30);

  r = await api('GET', '/api/posts');
  check('feed -> 200', r.status === 200, `got ${r.status}`);
  const feed = (r.data && r.data.posts) || [];
  check('feed returns array with count', Array.isArray(feed) && r.data.count === feed.length && feed.length >= 3);
  check('every feed post has author info', feed.every((p) => p.author && p.author.username));
  check('every feed post has likesCount + timestamps', feed.every((p) => typeof p.likesCount === 'number' && p.createdAt && p.updatedAt));
  const times = feed.map((p) => new Date(p.createdAt).getTime());
  check('feed sorted newest first', times.every((t, i) => i === 0 || times[i - 1] >= t), JSON.stringify(times));
  check('newest post is first in feed', feed[0] && feed[0].id === postIdNewest);
  check('own post appears in feed', feed.some((p) => p.id === postId1));
  check('feed has no password values or fields', !JSON.stringify(feed).toLowerCase().includes(PASS_E) && feed.every((p) => !('password' in p) && !('password' in p.author)));
  check('feed limit param respected (?limit=1)', (await api('GET', '/api/posts?limit=1')).data.posts.length === 1);

  console.log('[GET /api/posts] limit clamp');
  const clampIds = [];
  for (let i = 0; i < 101; i++) {
    const cr = await api('POST', '/api/posts', { content: `limit-clamp-${suffix}-${i}` }, tokenE);
    if (cr.data && cr.data.post && cr.data.post.id) clampIds.push(cr.data.post.id);
  }
  check('setup: 101 posts created for clamp test', clampIds.length === 101, `got ${clampIds.length}`);
  r = await api('GET', '/api/posts?limit=100000');
  check('huge limit clamped -> exactly 100 posts returned', r.status === 200 && r.data.posts.length === 100, `got ${r.data.posts.length}`);
  r = await api('GET', '/api/posts');
  check('default feed size stays within max (<=100)', r.status === 200 && r.data.posts.length <= 100);
  for (let i = 0; i < clampIds.length; i += 10) {
    await Promise.all(clampIds.slice(i, i + 10).map((id) => api('DELETE', `/api/posts/${id}`, null, tokenE)));
  }
  r = await api('GET', '/api/posts');
  check('clamp-test posts cleaned from feed', !((r.data.posts || []).some((p) => String(p.content || '').startsWith(`limit-clamp-${suffix}-`))));

  // ---------- GET SINGLE ----------
  console.log('[GET /api/posts/:id]');
  r = await api('GET', `/api/posts/${postId1}`);
  check('get single post -> 200', r.status === 200, `got ${r.status}`);
  check('single post matches created content', r.data.post && r.data.post.content === 'Hello world! My first post.');
  check('single post author is correct user', r.data.post && r.data.post.author.username === USER_E);

  r = await api('GET', '/api/posts/not-a-valid-id');
  check('invalid post ID format -> 400', r.status === 400, `got ${r.status}`);

  const ghostId = crypto.randomBytes(12).toString('hex');
  r = await api('GET', `/api/posts/${ghostId}`);
  check('valid-but-nonexistent ID -> 404', r.status === 404, `got ${r.status}`);

  // ---------- UPDATE ----------
  console.log('[PUT /api/posts/:id]');
  r = await api('PUT', `/api/posts/${postId1}`, { content: 'Updated content by owner' });
  check('update without token -> 401', r.status === 401);

  r = await api('PUT', `/api/posts/${postId1}`, { content: 'hijack attempt' }, tokenF);
  check('non-owner update -> 403', r.status === 403, `got ${r.status}`);

  r = await api('PUT', `/api/posts/not-a-valid-id`, { content: 'x' }, tokenE);
  check('update invalid ID format -> 400', r.status === 400, `got ${r.status}`);

  r = await api('PUT', `/api/posts/${ghostId}`, { content: 'x' }, tokenE);
  check('update nonexistent post -> 404', r.status === 404);

  r = await api('PUT', `/api/posts/${postId1}`, { content: '' }, tokenE);
  check('owner update to empty content -> 400', r.status === 400);

  r = await api('PUT', `/api/posts/${postId1}`, {}, tokenE);
  check('update with nothing to change -> 400', r.status === 400);

  r = await api('PUT', `/api/posts/${postId1}`, { content: 'x'.repeat(2001) }, tokenE);
  check('owner update content > 2000 chars -> 400', r.status === 400);

  r = await api('PUT', `/api/posts/${postId1}`, { author: idF }, tokenE);
  check('author is not an updatable field -> 400 (nothing else to change)', r.status === 400, `got ${r.status}`);

  r = await api('PUT', `/api/posts/${postId1}`, { content: 'Updated content by owner', imageUrl: 'https://example.com/new.png' }, tokenE);
  check('owner update -> 200', r.status === 200, `got ${r.status} ${JSON.stringify(r.data)}`);
  check('update response reflects new values', r.data.post && r.data.post.content === 'Updated content by owner' && r.data.post.imageUrl === 'https://example.com/new.png');

  // forbidden update must NOT have changed the post
  r = await api('GET', `/api/posts/${postId1}`);
  check('403 update left post unchanged', r.data.post && r.data.post.content === 'Updated content by owner' && r.data.post.author.username === USER_E);
  check('updatedAt advanced after owner update', new Date(r.data.post.updatedAt).getTime() >= new Date(r.data.post.createdAt).getTime());

  // ---------- DELETE ----------
  console.log('[DELETE /api/posts/:id]');
  r = await api('DELETE', `/api/posts/${postId1}`);
  check('delete without token -> 401', r.status === 401);

  r = await api('DELETE', `/api/posts/${postId1}`, null, tokenF);
  check('non-owner delete -> 403', r.status === 403, `got ${r.status}`);

  r = await api('DELETE', `/api/posts/not-a-valid-id`, null, tokenE);
  check('delete invalid ID format -> 400', r.status === 400, `got ${r.status}`);

  r = await api('DELETE', `/api/posts/${ghostId}`, null, tokenE);
  check('delete nonexistent post -> 404', r.status === 404);

  r = await api('DELETE', `/api/posts/${postId1}`, null, tokenE);
  check('owner delete -> 200', r.status === 200, `got ${r.status} ${JSON.stringify(r.data)}`);

  r = await api('GET', `/api/posts/${postId1}`);
  check('deleted post no longer exists -> 404', r.status === 404);

  r = await api('GET', '/api/posts');
  check('deleted post gone from feed', !((r.data.posts || []).some((p) => p.id === postId1)));

  // ---------- DB persistence via API round-trip ----------
  console.log('[MongoDB persistence via API]');
  const marker = `db-persist-check-${suffix}`;
  r = await api('POST', '/api/posts', { content: marker }, tokenE);
  const markerId = r.data.post.id;
  r = await api('GET', `/api/posts/${markerId}`);
  check('post persists in DB after create (fresh fetch)', r.status === 200 && r.data.post.content === marker);
  r = await api('DELETE', `/api/posts/${markerId}`, null, tokenE);
  r = await api('GET', `/api/posts/${markerId}`);
  check('deletion persisted in DB (fresh fetch)', r.status === 404);

  // ---------- SUMMARY ----------
  console.log('\n=== RESULTS ===');
  console.log(`PASS: ${pass}   FAIL: ${fail}`);
  if (fail) {
    console.log('Failures:', failures.join(' | '));
    process.exit(1);
  }
})();
