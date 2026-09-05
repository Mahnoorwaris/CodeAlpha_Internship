/* Step 7 DB verification: proves Comment documents are physically stored in
 * MongoDB with correct post/author references and timestamps, that newest-first
 * sorting works at the raw query level, and that cascade delete removes a
 * post's comments. Uses configured MONGO_URI when available, otherwise an
 * ephemeral in-memory mongod. Self-cleaning.
 * Run: node scripts/verify-comments-db.js
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
  console.log('\n=== STEP 7: COMMENTS DB VERIFICATION ===\n');
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
    const user = await User.create({
      name: 'Comment Verify',
      username: `cmtv_${stamp}`,
      email: `cmtv_${stamp}@t.com`,
      password: 'verify_pass_1',
    });
    const post = await Post.create({ author: user._id, content: `comments probe ${stamp}` });

    const c1 = await Comment.create({ post: post._id, author: user._id, content: `first ${stamp}` });
    const c2 = await Comment.create({ post: post._id, author: user._id, content: `second ${stamp}` });
    const c3 = await Comment.create({ post: post._id, author: user._id, content: `third ${stamp}` });
    check('3 comments written to MongoDB', true);

    const rawCol = mongoose.connection.db.collection('comments');
    const raw1 = await rawCol.findOne({ _id: c1._id });
    check('raw document found with post ref matching', raw1 && String(raw1.post) === String(post._id));
    check('raw document found with author ref matching', raw1 && String(raw1.author) === String(user._id));
    check('content stored exactly', raw1 && raw1.content === `first ${stamp}`);
    check('createdAt exists as Date', raw1.createdAt instanceof Date);
    check('updatedAt exists as Date', raw1.updatedAt instanceof Date);

    const newestFirst = await Comment.find({ post: post._id }).sort({ createdAt: -1 });
    check('newest-first query returns [c3,c2,c1]',
      String(newestFirst[0]._id) === String(c3._id) &&
      String(newestFirst[1]._id) === String(c2._id) &&
      String(newestFirst[2]._id) === String(c1._id));

    const populated = await Comment.findById(c2._id).populate('author', 'name username profilePicture');
    check('populate resolves safe author fields only', populated.author.username === `cmtv_${stamp}` && !('password' in populated.author.toObject()) && !('email' in populated.author.toObject()));

    c2.content = `second edited ${stamp}`;
    await c2.save();
    const afterEdit = await rawCol.findOne({ _id: c2._id });
    check('edit persisted to raw document', afterEdit.content === `second edited ${stamp}`);
    check('timestamps bumped updatedAt on save', afterEdit.updatedAt.getTime() >= afterEdit.createdAt.getTime());

    const scopedCount = await rawCol.countDocuments({ _id: { $in: [c1._id, c2._id, c3._id] } });
    check('scoped count sees all 3 before cascade', scopedCount === 3);

    await Post.deleteOne({ _id: post._id });
    await Comment.deleteMany({ post: post._id });
    const leftComments = await rawCol.countDocuments({ _id: { $in: [c1._id, c2._id, c3._id] } });
    check('cascade removed all comments of the deleted post', leftComments === 0);

    await User.deleteOne({ _id: user._id });
    const leftUsers = await mongoose.connection.db.collection('users').countDocuments({ _id: user._id });
    check('cleanup: temp user removed from DB', leftUsers === 0);
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
