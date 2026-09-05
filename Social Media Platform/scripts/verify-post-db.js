/* Post DB verification: proves a Post document physically exists in MongoDB
 * with correct fields. Uses the configured MONGO_URI when available, otherwise
 * an ephemeral in-memory mongod. Creates temp docs, verifies them by querying
 * the raw collection, then removes them (self-cleaning).
 * Run: node scripts/verify-post-db.js
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
  console.log('\n=== STEP 4: POSTS MONGODB PERSISTENCE VERIFICATION ===\n');
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

  try {
    const stamp = Date.now() % 1000000;
    const user = await User.create({
      name: 'DB Verify Bot',
      username: `dbverify_${stamp}`,
      email: `dbverify_${stamp}@test.com`,
      password: 'verify_pass_1',
    });

    const created = await Post.create({
      author: user._id,
      content: `step5 persistence probe ${stamp}`,
      imageUrl: 'https://example.com/verify.png',
      likes: [user._id],
    });
    check('Post.create() wrote a document to MongoDB', !!created._id);

    const rawDoc = await mongoose.connection.db.collection('posts').findOne({ _id: created._id });
    check('document found in raw "posts" collection', !!rawDoc);
    check('author stored as ObjectId ref matching user _id', rawDoc && String(rawDoc.author) === String(user._id));
    check('content matches exactly', rawDoc && rawDoc.content === `step5 persistence probe ${stamp}`);
    check('imageUrl stored', rawDoc && rawDoc.imageUrl === 'https://example.com/verify.png');
    check('likes[] stored with 1 entry', Array.isArray(rawDoc.likes) && rawDoc.likes.length === 1);
    check('createdAt exists as Date', rawDoc && rawDoc.createdAt instanceof Date);
    check('updatedAt exists as Date', rawDoc && rawDoc.updatedAt instanceof Date);

    const fetched = await Post.findById(created._id).populate('author', 'name username profilePicture');
    check('findById + populate resolves author username', fetched && fetched.author && fetched.author.username === `dbverify_${stamp}`);
    check('likesCount computes correctly', fetched && fetched.likes.length === 1);

    fetched.content = `updated probe ${stamp}`;
    await fetched.save();
    const afterUpdate = await Post.findById(created._id);
    check('update persisted to MongoDB', afterUpdate && afterUpdate.content === `updated probe ${stamp}`);
    check('timestamps auto-update updatedAt on save', afterUpdate && afterUpdate.updatedAt.getTime() >= afterUpdate.createdAt.getTime());

    await Post.deleteOne({ _id: created._id });
    await User.deleteOne({ _id: user._id });
    const remainingPosts = await mongoose.connection.db.collection('posts').countDocuments({ _id: created._id });
    const remainingUsers = await mongoose.connection.db.collection('users').countDocuments({ _id: user._id });
    check('cleanup: temp post removed from DB', remainingPosts === 0);
    check('cleanup: temp user removed from DB', remainingUsers === 0);
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
