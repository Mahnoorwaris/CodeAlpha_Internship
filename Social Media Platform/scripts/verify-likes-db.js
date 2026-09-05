/* Step 6 DB verification: proves likes[] is stored correctly in MongoDB at the
 * raw-document level and that duplicate likes cannot create duplicate entries.
 * Uses configured MONGO_URI when available, otherwise an ephemeral in-memory
 * mongod. Creates temp docs, applies like/unlike writes exactly like the API
 * routes ($addToSet/$pull), verifies RAW documents, self-cleans.
 * Run: node scripts/verify-likes-db.js
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
  console.log('\n=== STEP 6: LIKES DB VERIFICATION ===\n');
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
    const userA = await User.create({
      name: 'Likes Verify A',
      username: `likva_${stamp}`,
      email: `likva_${stamp}@t.com`,
      password: 'verify_pass_1',
    });
    const userB = await User.create({
      name: 'Likes Verify B',
      username: `likvb_${stamp}`,
      email: `likvb_${stamp}@t.com`,
      password: 'verify_pass_2',
    });

    const post = await Post.create({ author: userA._id, content: `likes probe ${stamp}` });
    check('post created with empty likes[]', post.likes.length === 0);

    const rawCol = () => mongoose.connection.db.collection('posts');

    // Like via the exact write the API route performs
    await Post.updateOne({ _id: post._id }, { $addToSet: { likes: userA._id } });
    let raw = await rawCol().findOne({ _id: post._id });
    check('$addToSet stored liker ObjectId in raw likes[]', (raw.likes || []).some((x) => String(x) === String(userA._id)));
    check('raw likes[] length is exactly 1', (raw.likes || []).length === 1);

    // Duplicate-prevention at the storage level: same $addToSet again
    await Post.updateOne({ _id: post._id }, { $addToSet: { likes: userA._id } });
    raw = await rawCol().findOne({ _id: post._id });
    check('repeated $addToSet created NO duplicate entry', (raw.likes || []).length === 1);

    // Second distinct user likes
    await Post.updateOne({ _id: post._id }, { $addToSet: { likes: userB._id } });
    raw = await rawCol().findOne({ _id: post._id });
    const uniqueIds = new Set((raw.likes || []).map(String));
    check('two users -> likes[] has 2 distinct ObjectIds', (raw.likes || []).length === 2 && uniqueIds.size === 2);
    check('all entries are valid ObjectIds', (raw.likes || []).every((x) => x instanceof mongoose.Types.ObjectId || mongoose.isValidObjectId(x)));

    // Unlike via the exact write the API route performs
    await Post.updateOne({ _id: post._id }, { $pull: { likes: userA._id } });
    raw = await rawCol().findOne({ _id: post._id });
    check('$pull removed only user A from likes[]', (raw.likes || []).length === 1 && String(raw.likes[0]) === String(userB._id));

    const updated = await Post.findById(post._id);
    check('model-level likesCount computes to 1', updated.likes.length === 1);

    await Post.updateOne({ _id: post._id }, { $pull: { likes: userB._id } });
    raw = await rawCol().findOne({ _id: post._id });
    check('both unlikes restore empty likes[]', Array.isArray(raw.likes) && raw.likes.length === 0);

    await Post.deleteOne({ _id: post._id });
    await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });
    const leftPosts = await rawCol().countDocuments({ _id: post._id });
    const leftUsers = await mongoose.connection.db.collection('users').countDocuments({ _id: { $in: [userA._id, userB._id] } });
    check('cleanup: temp post + users removed', leftPosts === 0 && leftUsers === 0);
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
