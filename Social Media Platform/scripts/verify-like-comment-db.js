/* Step 5 DB verification: proves likes[] and comments behave correctly at the
 * RAW MongoDB document level. Uses the configured MONGO_URI when available,
 * otherwise an ephemeral in-memory mongod. Applies like/unlike writes exactly
 * like the API routes ($addToSet/$pull), verifies raw documents, checks comment
 * persistence/references/removal, then removes all temporary data.
 * Run: node scripts/verify-like-comment-db.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const PLACEHOLDER_PATTERN = /<USERNAME>|<PASSWORD>|<CLUSTER>|<DATABASE>/i;

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

(async () => {
  console.log('\n=== STEP 5: LIKES + COMMENTS DB VERIFICATION ===\n');
  let mem = null;
  let mode;

  const configured = process.env.MONGO_URI;
  if (configured && !PLACEHOLDER_PATTERN.test(configured)) {
    mode = 'configured MONGO_URI';
  } else {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mem = await MongoMemoryServer.create();
    process.env.MONGO_URI = mem.getUri('socialmedia_verify');
    mode = 'ephemeral in-memory MongoDB (no usable MONGO_URI set)';
  }

  await mongoose.connect(process.env.MONGO_URI);
  const User = require('../models/User');
  const Post = require('../models/Post');
  const Comment = require('../models/Comment');

  try {
    const stamp = Date.now() % 1000000;
    const userA = await User.create({
      name: 'LC Verify A',
      username: `lcva_${stamp}`,
      email: `lcva_${stamp}@t.com`,
      password: 'verify_pass_1',
    });
    const userB = await User.create({
      name: 'LC Verify B',
      username: `lcvb_${stamp}`,
      email: `lcvb_${stamp}@t.com`,
      password: 'verify_pass_2',
    });

    const post = await Post.create({ author: userA._id, content: `like-comment probe ${stamp}` });

    // ---------- LIKES (raw posts collection) ----------
    console.log('[likes raw document]');
    let rawPost = await mongoose.connection.db.collection('posts').findOne({ _id: post._id });
    check('post starts with empty likes[]', Array.isArray(rawPost.likes) && rawPost.likes.length === 0);

    await Post.updateOne({ _id: post._id }, { $addToSet: { likes: userA._id } });
    rawPost = await mongoose.connection.db.collection('posts').findOne({ _id: post._id });
    check('$addToSet stored liker ObjectId', (rawPost.likes || []).some((x) => String(x) === String(userA._id)));
    check('raw likes[] length exactly 1', (rawPost.likes || []).length === 1);

    await Post.updateOne({ _id: post._id }, { $addToSet: { likes: userA._id } });
    rawPost = await mongoose.connection.db.collection('posts').findOne({ _id: post._id });
    check('repeated $addToSet created NO duplicate like', (rawPost.likes || []).length === 1);

    await Post.updateOne({ _id: post._id }, { $addToSet: { likes: userB._id } });
    rawPost = await mongoose.connection.db.collection('posts').findOne({ _id: post._id });
    const uniq = new Set((rawPost.likes || []).map(String));
    check('two likers -> 2 distinct ObjectIds, still duplicate-free', (rawPost.likes || []).length === 2 && uniq.size === 2);
    check('all like entries are valid ObjectIds', (rawPost.likes || []).every((x) => mongoose.isValidObjectId(x)));

    await Post.updateOne({ _id: post._id }, { $pull: { likes: userA._id } });
    rawPost = await mongoose.connection.db.collection('posts').findOne({ _id: post._id });
    check('$pull removed ONLY that user (B remains)', (rawPost.likes || []).length === 1 && String(rawPost.likes[0]) === String(userB._id));

    await Post.updateOne({ _id: post._id }, { $pull: { likes: userB._id } });
    rawPost = await mongoose.connection.db.collection('posts').findOne({ _id: post._id });
    check('second $pull restores empty likes[]', Array.isArray(rawPost.likes) && rawPost.likes.length === 0);

    // ---------- COMMENTS (raw comments collection) ----------
    console.log('[comments raw documents]');
    const c1 = await Comment.create({ post: post._id, author: userB._id, content: `probe comment one ${stamp}` });
    const c2 = await Comment.create({ post: post._id, author: userB._id, content: `probe comment two ${stamp}` });
    const rawCol = mongoose.connection.db.collection('comments');

    let rawC1 = await rawCol.findOne({ _id: c1._id });
    check('comment persisted with correct post ObjectId', !!rawC1 && String(rawC1.post) === String(post._id));
    check('comment persisted with correct author ObjectId', !!rawC1 && String(rawC1.author) === String(userB._id));
    check('comment content stored exactly', rawC1 && rawC1.content === `probe comment one ${stamp}`);
    check('comment createdAt is a real Date', !!rawC1 && rawC1.createdAt instanceof Date);
    check('comment updatedAt is a real Date', !!rawC1 && rawC1.updatedAt instanceof Date);

    const populated = await Comment.findById(c2._id).populate('author', 'name username profilePicture');
    check(
      'populate exposes safe author fields only',
      populated.author.username === `lcvb_${stamp}` &&
        !('password' in populated.author.toObject()) &&
        !('email' in populated.author.toObject())
    );

    await Comment.deleteOne({ _id: c2._id });
    const c2Left = await rawCol.countDocuments({ _id: c2._id });
    check('deleted comment actually removed from MongoDB', c2Left === 0);

    // ---------- Cleanup ----------
    console.log('[cleanup]');
    await Comment.deleteMany({ post: post._id }); // cascade like DELETE /api/posts/:id
    const leftComments = await rawCol.countDocuments({ post: post._id });
    check('no orphaned comments remain for temp post', leftComments === 0);

    await Post.deleteOne({ _id: post._id });
    await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });
    const leftPosts = await mongoose.connection.db.collection('posts').countDocuments({ _id: post._id });
    const leftUsers = await mongoose.connection.db.collection('users').countDocuments({ _id: { $in: [userA._id, userB._id] } });
    check('temp post + users removed from DB', leftPosts === 0 && leftUsers === 0);
  } finally {
    await mongoose.disconnect();
    if (mem) await mem.stop();
  }

  console.log(`\nMode: ${mode} (credentials never printed)`);
  console.log('=== RESULTS ===');
  console.log(`PASS: ${pass}   FAIL: ${fail}`);
  if (fail) {
    console.log('Failures:', failures.join(' | '));
    process.exit(1);
  }
})();
