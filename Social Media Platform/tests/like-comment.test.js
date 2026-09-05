/* Step 5 test suite: likes + comments system
 * Run: node tests/like-comment.test.js   (server must be running)
 * Self-contained: registers its own users/posts and cleans up afterwards.
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
  console.log('\n=== STEP 5: LIKES + COMMENTS TESTS ===\n');
  const suffix = Date.now() % 1000000;
  const U1 = `own_${suffix}`;
  const U2 = `lika_${suffix}`;
  const U3 = `likb_${suffix}`;

  // ---------- Setup ----------
  let r = await api('POST', '/api/auth/register', { name: 'Owner One', username: U1, email: `${U1}@test.com`, password: 'owner_pass_1' });
  check('setup: register owner -> 201', r.status === 201, JSON.stringify(r.data));
  const token1 = r.data.token;

  r = await api('POST', '/api/auth/register', { name: 'Liker Two', username: U2, email: `${U2}@test.com`, password: 'liker_pass_2' });
  check('setup: register liker A -> 201', r.status === 201);
  const token2 = r.data.token;
  const id2 = r.data.user && r.data.user.id;

  r = await api('POST', '/api/auth/register', { name: 'Liker Three', username: U3, email: `${U3}@test.com`, password: 'liker_pass_3' });
  check('setup: register liker B -> 201', r.status === 201);
  const token3 = r.data.token;

  r = await api('POST', '/api/posts', { content: `Target post for likes/comments ${suffix}` }, token1);
  check('setup: target post created -> 201', r.status === 201);
  const postId = r.data.post.id;

  const ghostPostId = crypto.randomBytes(12).toString('hex');
  const ghostCommentId = crypto.randomBytes(12).toString('hex');

  // ---------- LIKES ----------
  console.log('[POST like] guard rails');
  r = await api('POST', `/api/posts/${postId}/like`);
  check('like without token -> 401', r.status === 401, `got ${r.status}`);

  r = await api('POST', `/api/posts/${postId}/like`, null, 'garbage.token.value');
  check('like with invalid token -> 401', r.status === 401);

  r = await api('POST', '/api/posts/not-a-valid-id/like', null, token2);
  check('like invalid post ID -> 400', r.status === 400, `got ${r.status}`);

  r = await api('POST', `/api/posts/${ghostPostId}/like`, null, token2);
  check('like non-existing post -> 404', r.status === 404);

  console.log('[POST like] happy path');
  r = await api('POST', `/api/posts/${postId}/like`, null, token2);
  check('successful like -> likesCount 1', r.status === 200 && r.data.likesCount === 1, `got ${r.status} ${JSON.stringify(r.data)}`);

  r = await api('POST', `/api/posts/${postId}/like`, null, token2);
  check('duplicate like rejected -> 409', r.status === 409, `got ${r.status}`);

  r = await api('GET', `/api/posts/${postId}`);
  check('duplicate like did not increase count (still 1)', r.data.post && r.data.post.likesCount === 1);

  r = await api('POST', `/api/posts/${postId}/like`, null, token3);
  check('different user can like same post -> likesCount 2', r.status === 200 && r.data.likesCount === 2);

  console.log('[DELETE like] happy path');
  r = await api('DELETE', `/api/posts/${postId}/like`, null, token2);
  check('unlike removes only own like -> likesCount 1', r.status === 200 && r.data.likesCount === 1, `got ${r.status} ${JSON.stringify(r.data)}`);
  r = await api('GET', `/api/posts/${postId}`);
  check("other user's like preserved after unlike", r.data.post.likesCount === 1);

  r = await api('DELETE', `/api/posts/${postId}/like`, null, token2);
  check('unliking twice -> 409 (no corruption)', r.status === 409, `got ${r.status}`);

  r = await api('GET', `/api/posts/${postId}`);
  check('double-unlike left data intact (count still 1)', r.data.post && r.data.post.likesCount === 1);

  r = await api('POST', `/api/posts/${postId}/like`, null, token2);
  check('can like/unlike repeatedly (re-like ok)', r.status === 200 && r.data.likesCount === 2);

  r = await api('DELETE', `/api/posts/not-a-valid-id/like`, null, token2);
  check('unlike invalid post ID -> 400', r.status === 400);

  r = await api('DELETE', `/api/posts/${ghostPostId}/like`, null, token2);
  check('unlike non-existing post -> 404', r.status === 404);

  r = await api('DELETE', `/api/posts/${postId}/like`);
  check('unlike without token -> 401', r.status === 401);

  // ---------- COMMENTS ----------
  console.log('[POST comment] guard rails');
  r = await api('POST', `/api/posts/${postId}/comments`, { content: 'no token' });
  check('comment without token -> 401', r.status === 401, `got ${r.status}`);

  r = await api('POST', `/api/posts/${postId}/comments`, { content: 'bad token' }, 'not.a.jwt');
  check('comment with invalid token -> 401', r.status === 401);

  r = await api('POST', '/api/posts/not-a-valid-id/comments', { content: 'x' }, token2);
  check('comment invalid post ID -> 400', r.status === 400);

  r = await api('POST', `/api/posts/${ghostPostId}/comments`, { content: 'x' }, token2);
  check('comment non-existing post -> 404', r.status === 404);

  console.log('[POST comment] validation');
  r = await api('POST', `/api/posts/${postId}/comments`, { content: '' }, token2);
  check('empty comment -> 400', r.status === 400);

  r = await api('POST', `/api/posts/${postId}/comments`, { content: '   ' }, token2);
  check('whitespace-only comment -> 400', r.status === 400);

  r = await api('POST', `/api/posts/${postId}/comments`, {}, token2);
  check('missing content -> 400', r.status === 400);

  r = await api('POST', `/api/posts/${postId}/comments`, { content: 'x'.repeat(501) }, token2);
  check('overlong comment (>500) -> 400', r.status === 400);

  console.log('[POST comment] happy path');
  r = await api('POST', `/api/posts/${postId}/comments`, { content: `  nice post  `, author: id2 }, token2);
  check('successful comment -> 201', r.status === 201 && !!r.data.comment, `got ${r.status} ${JSON.stringify(r.data)}`);
  check('comment whitespace trimmed', r.data.comment && r.data.comment.content === 'nice post');
  check('client-supplied author ignored (real author used)', r.data.comment.author && r.data.comment.author.username === U2);
  check(
    'comment has full shape (_id/post/author/content/timestamps)',
    !!(r.data.comment &&
      r.data.comment.id &&
      String(r.data.comment.post) === String(postId) &&
      r.data.comment.author &&
      typeof r.data.comment.content === 'string' &&
      r.data.comment.createdAt &&
      r.data.comment.updatedAt),
    JSON.stringify(r.data.comment)
  );
  const commentA = r.data.comment && r.data.comment.id;

  r = await api('POST', `/api/posts/${postId}/comments`, { content: 'comment by third user' }, token3);
  check('second commenter -> 201', r.status === 201);
  const commentB = r.data.comment && r.data.comment.id;

  console.log('[GET comments]');
  r = await api('GET', `/api/posts/${postId}/comments`);
  check('get comments public (no token) -> 200', r.status === 200, `got ${r.status}`);
  const clist = (r.data && r.data.comments) || [];
  check('all comments returned', Array.isArray(clist) && clist.length >= 2);
  check('every comment has safe author info', clist.every((c) => c.author && c.author.username));
  check('no password fields anywhere in comments', !JSON.stringify(clist).toLowerCase().includes('_pass_') && clist.every((c) => !('password' in c.author)));
  check('comments reference correct post', clist.every((c) => String(c.post) === String(postId)));
  r = await api('GET', '/api/posts/not-a-valid-id/comments');
  check('list comments invalid post ID -> 400', r.status === 400);

  console.log('[DELETE comment]');
  r = await api('DELETE', `/api/comments/${commentB}`, null, token2);
  check("cannot delete another user's comment -> 403", r.status === 403, `got ${r.status}`);

  r = await api('DELETE', `/api/comments/${commentB}`);
  check('delete without token -> 401', r.status === 401);

  r = await api('DELETE', '/api/comments/not-a-valid-id', null, token3);
  check('delete invalid comment ID -> 400', r.status === 400);

  r = await api('DELETE', `/api/comments/${ghostCommentId}`, null, token3);
  check('delete non-existing comment -> 404', r.status === 404);

  r = await api('DELETE', `/api/comments/${commentB}`, null, token3);
  check('delete own comment -> success', r.status === 200, `got ${r.status} ${JSON.stringify(r.data)}`);

  r = await api('GET', `/api/posts/${postId}/comments`);
  check('deleted comment removed from list', !(r.data.comments || []).some((c) => c.id === commentB));

  r = await api('DELETE', `/api/comments/${commentB}`, null, token3);
  check('deleting same comment again -> 404', r.status === 404);

  // ---------- Cleanup ----------
  console.log('[cleanup]');
  r = await api('DELETE', `/api/posts/${postId}`, null, token1);
  check('cleanup: owner deletes target post -> 200', r.status === 200);

  r = await api('GET', `/api/posts/${postId}`);
  check('cleanup: post gone -> 404', r.status === 404);

  r = await api('GET', `/api/posts/${postId}/comments`);
  check('cleanup: no orphaned comments endpoint-wise -> 404', r.status === 404);

  // ---------- SUMMARY ----------
  console.log('\n=== RESULTS ===');
  console.log(`PASS: ${pass}   FAIL: ${fail}`);
  if (fail) {
    console.log('Failures:', failures.join(' | '));
    process.exit(1);
  }
})();
