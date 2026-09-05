/* Step 8 test suite: frontend assets + UI-flow smoke (mirrors exact SPA calls)
 * Run: node tests/frontend.test.js   (server must be running)
 */
const path = require('path');
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

async function raw(pathName) {
  const res = await fetch(`${BASE}${pathName}`);
  const text = await res.text();
  return { status: res.status, type: res.headers.get('content-type') || '', text };
}

async function api(method, pathName, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${pathName}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

(async () => {
  console.log('\n=== STEP 8: FRONTEND TESTS ===\n');

  // ---------- Static assets ----------
  console.log('[static assets]');
  const home = await raw('/');
  check('GET / -> 200 html', home.status === 200 && /text\/html/.test(home.type));
  check('viewport meta present (responsive)', home.text.includes('name="viewport"'));
  check('auth/feed/suggestions/profile views present', ['view-auth', 'view-feed', 'view-suggestions', 'view-profile'].every((id) => home.text.includes(id)));
  const scripts = ['/js/ui.js', '/js/api.js', '/js/store.js', '/js/templates.js', '/js/feed.js', '/js/profile.js', '/js/app.js'];
  check('index references all 7 script modules', scripts.every((s) => home.text.includes(s)));

  const css = await raw('/css/style.css');
  check('stylesheet -> 200 css', css.status === 200 && /text\/css/.test(css.type));
  check('responsive @media queries present', (css.text.match(/@media/g) || []).length >= 2);

  const jsFiles = {};
  for (const s of scripts) {
    const r = await raw(s);
    jsFiles[s] = r;
    check(`asset ${s} -> 200 javascript`, r.status === 200 && /javascript|ecmascript/.test(r.type));
  }
  check('logout button present in header markup', home.text.includes('id="logout-btn"'));
  check('logout handler wired in app.js', /getElementById\('logout-btn'\)/.test(jsFiles['/js/app.js'].text));
  check('SPA serves public profiles without login', (jsFiles['/js/app.js'].text.match(/#\/profile\//g) || []).length >= 2);
  const allJs = scripts.map((s) => jsFiles[s].text).join('');
  check('no JWT secret in any served asset', !allJs.includes('JWT_SECRET') && !allJs.includes(process.env.JWT_SECRET || '__none__'));
  check('no Mongo credentials in any served asset', !allJs.includes('MONGO_URI') && !allJs.toLowerCase().includes('mongodb+srv'));

  // ---------- Pure-function security units (Node-side) ----------
  console.log('[XSS escaping units]');
  const ui = require(path.join(__dirname, '..', 'public', 'js', 'ui.js'));
  check('escapeHtml neutralizes <script>', ui.escapeHtml('<script>alert(1)</script>') === '&lt;script&gt;alert(1)&lt;/script&gt;');
  check('escapeHtml escapes quotes (attr-safe)', ui.escapeHtml('"\'onmouseover=\'') === '&quot;&#39;onmouseover=&#39;&quot;' || !/[<>"']/.test(ui.escapeHtml('"\'x\'"')));
  check('escapeHtml handles ampersand', ui.escapeHtml('a&b') === 'a&amp;b');
  check('initials computed correctly', ui.initials('Ada Lovelace') === 'AL');
  check('timeAgo returns just-now for fresh date', ui.timeAgo(new Date(Date.now() - 2000).toISOString()) === 'just now');
  check('templates escape post content', jsFiles['/js/templates.js'].text.includes('E(p.content)') && jsFiles['/js/templates.js'].text.includes('E(c.content)'));
  check('no inline innerHTML with unescaped user fields', !/innerHTML\s*\+=?\s*[^'"]*\$\{(?!\s*TPL|.*\bUI\.)/.test(jsFiles['/js/feed.js'].text));

  // ---------- Button busy-state machine (the Like/Follow stuck-button fix) ----------
  console.log('[button busy-state machine]');
  const UI = require(path.join(__dirname, '..', 'public', 'js', 'ui.js'));
  function fakeBtn(label) { return { disabled: false, textContent: label, dataset: {} }; }
  let bb = fakeBtn('Like');
  UI.setBusy(bb, true);
  check('busy start: stores original label, disables, shows Working…', bb.dataset.label === 'Like' && bb.textContent === 'Working…' && bb.disabled === true);
  UI.setBusy(bb, false);
  check('loading state resets after SUCCESS (prior label restored)', bb.disabled === false && bb.textContent === 'Like' && !('busy' in bb.dataset));
  UI.setBusy(bb, true);
  UI.setBusy(bb, false);
  check('loading state resets after FAILURE (same clearing path)', bb.disabled === false && bb.textContent === 'Like');
  UI.setBusy(bb, true);
  bb.textContent = 'Unlike';
  bb.dataset.label = 'Unlike'; // handlers sync new truth mid-flight
  UI.setBusy(bb, false);
  check('state change during busy survives reset (Unlike kept, not clobbered)', bb.disabled === false && bb.textContent === 'Unlike');
  UI.setBusy(bb, true);
  UI.setBusy(bb, true); // rapid re-entry while busy
  check('re-entrant busy never snapshots Working… as restore label', bb.dataset.label === 'Unlike' && bb.textContent === 'Working…');
  UI.setBusy(bb, false);
  UI.setBusy(bb, false);
  check('double reset is safe and stable', bb.disabled === false && bb.textContent === 'Unlike' && !('label' in bb.dataset));

  // ---------- UI-mirroring API flow ----------
  console.log('[login/register flow]');
  const suffix = Date.now() % 1000000;
  const U1 = `zara_${suffix}`;
  const U2 = `yusuf_${suffix}`;
  let r = await api('POST', '/api/auth/register', { name: 'Zara One', username: U1, email: `${U1}@t.com`, password: 'zara_pass_1' });
  check('register (as Register tab does) -> 201', r.status === 201);
  const tok1 = r.data.token;
  r = await api('POST', '/api/auth/register', { name: 'Yusuf Two', username: U2, email: `${U2}@t.com`, password: 'yusuf_pass_2' });
  const tok2 = r.data.token;
  r = await api('POST', '/api/auth/login', { email: `${U1}@t.com`, password: 'zara_pass_1' });
  check('login (as Login tab does) -> 200 + token + user', r.status === 200 && r.data.token && r.data.user.username === U1);

  console.log('[feed + composer flow]');
  r = await api('POST', '/api/posts', { content: 'Frontend smoke post <img src=x onerror=alert(1)>', imageUrl: 'https://example.com/pic.png' }, tok1);
  check('create post (composer payload) -> 201', r.status === 201);
  const postId = r.data.post.id;
  r = await api('POST', '/api/posts', { content: 'Second post for ordering' }, tok2);
  const postId2 = r.data.post.id;
  r = await api('GET', '/api/posts?limit=50');
  check('feed -> 200, newest first, author embedded', r.data.posts[0].id === postId2 && r.data.posts.every((p) => p.author.username));
  const stored = JSON.stringify(r.data.posts.find((p) => p.id === postId));
  check('server stores XSS payload raw (frontend must escape)', stored.includes('<img src=x'));
  check('raw passwords never in feed payload', !stored.includes('zara_pass_1'));

  console.log('[like/unlike flow]');
  r = await api('POST', `/api/posts/${postId}/like`, null, tok2);
  check('like -> likesCount 1', r.status === 200 && r.data.likesCount === 1);
  r = await api('POST', `/api/posts/${postId}/like`, null, tok2);
  check('duplicate like -> 409 (UI reconciles state)', r.status === 409);
  r = await api('DELETE', `/api/posts/${postId}/like`, null, tok2);
  check('unlike -> likesCount 0', r.status === 200 && r.data.likesCount === 0);
  r = await api('POST', `/api/posts/${postId}/like`, null, tok2);
  check('re-like -> numeric likesCount (field the button reads)', r.status === 200 && typeof r.data.likesCount === 'number');
  r = await api('POST', `/api/posts/${postId}/like`, null, tok2);
  check('duplicate like 409 carries message the UI reconciler parses', r.status === 409 && /already liked/i.test(r.data.message || ''), JSON.stringify(r.data));
  r = await api('DELETE', `/api/posts/${postId}/like`, null, tok2);
  check('unlike again -> numeric likesCount back to 0', r.status === 200 && typeof r.data.likesCount === 'number');

  console.log('[comments flow]');
  r = await api('POST', `/api/posts/${postId}/comments`, { content: 'nice!' }, tok2);
  check('add comment -> 201', r.status === 201);
  const cid = r.data.comment.id;
  r = await api('PUT', `/api/comments/${cid}`, { content: 'nice! (edited)' }, tok2);
  check('edit own comment -> 200', r.status === 200 && r.data.comment.content === 'nice! (edited)');
  r = await api('DELETE', `/api/comments/${cid}`, null, tok1);
  check('non-owner comment delete -> 403', r.status === 403);
  r = await api('DELETE', `/api/comments/${cid}`, null, tok2);
  check('delete own comment -> 200', r.status === 200);
  r = await api('GET', `/api/posts/${postId}/comments`);
  check('comment list endpoint public -> 200', r.status === 200 && r.data.count === 0);

  console.log('[profile + follow flow]');
  r = await api('GET', `/api/users/${U1}`);
  check('public profile -> 200 with counts', r.status === 200 && typeof r.data.profile.followersCount === 'number' && typeof r.data.profile.followingCount === 'number');
  r = await api('GET', `/api/users/${U1.toUpperCase()}`);
  check('public profile case-insensitive (as SPA deep-link)', r.status === 200 && r.data.profile.username === U1);
  r = await api('PUT', '/api/users/profile', { name: 'Zara Updated', bio: 'hello bio' }, tok1);
  check('edit own profile -> 200 reflected', r.status === 200 && r.data.user.name === 'Zara Updated');
  const id1 = r.data.user.id;
  r = await api('POST', `/api/users/${id1}/follow`, null, tok2);
  check('follow from suggestions/profile -> success', r.status === 200 && r.data.followingCount === 1);
  check('follow response has numeric followersCount (stat updater reads it)', typeof r.data.followersCount === 'number');
  r = await api('GET', '/api/users/suggestions', null, tok2);
  check('suggestions sidebar payload -> 200 array', r.status === 200 && Array.isArray(r.data.users));
  check('suggestions exclude self (own card never shown)', r.data.users.every((u) => u.username !== U2));
  check('suggestion rows carry username + followersCount', r.data.users.length === 0 || r.data.users.every((u) => u.username && typeof u.followersCount === 'number'));
  r = await api('DELETE', `/api/users/${id1}/follow`, null, tok2);
  check('unfollow -> relationships removed', r.status === 200 && r.data.followingCount === 0);
  check('unfollow response has numeric followersCount for button state', typeof r.data.followersCount === 'number');

  console.log('[session handling]');
  r = await api('GET', '/api/auth/me');
  check('logged-out request to protected route -> 401', r.status === 401);
  r = await api('GET', '/api/auth/me', null, 'garbage.token.value');
  check('expired/invalid token -> 401 (SPA clears session)', r.status === 401);
  r = await api('GET', '/api/health');
  check('health still ok', r.status === 200 && r.data.status === 'ok');

  // ---------- SUMMARY ----------
  console.log('\n=== RESULTS ===');
  console.log(`PASS: ${pass}   FAIL: ${fail}`);
  if (fail) {
    console.log('Failures:', failures.join(' | '));
    process.exit(1);
  }
})();
