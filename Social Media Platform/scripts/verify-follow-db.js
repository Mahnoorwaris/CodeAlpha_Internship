/* Step 4 DB verification: proves followers[]/following[] stay symmetric at the
 * MongoDB document level. Uses configured MONGO_URI when available, otherwise
 * an ephemeral in-memory mongod. Creates temp users, applies follow/unfollow
 * writes exactly like the API routes ($addToSet/$pull on both sides), then
 * scans RAW documents for edge symmetry. Includes a deliberate one-sided-write
 * negative control so a broken scanner can't pass vacuously. Self-cleaning.
 * Run: node scripts/verify-follow-db.js
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
  console.log('\n=== STEP 4: FOLLOW SYMMETRY DB VERIFICATION ===\n');
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

  // Scans RAW documents (bypasses mongoose) for symmetric follow edges among
  // the given users only - safe to run against a shared database.
  async function scanSymmetry(users) {
    const docs = await mongoose.connection.db
      .collection('users')
      .find({ _id: { $in: users.map((u) => u._id) } })
      .toArray();
    const ids = new Set(docs.map((d) => String(d._id)));
    const violations = [];
    const edges = new Set();
    for (const doc of docs) {
      for (const f of doc.following || []) {
        if (!ids.has(String(f))) continue;
        edges.add(`${doc._id}->${f}`);
      }
    }
    for (const edge of edges) {
      const [from, to] = edge.split('->');
      const target = docs.find((d) => String(d._id) === to);
      if (!target || !(target.followers || []).some((x) => String(x) === from)) {
        violations.push(`${from} follows ${to} but is missing from ${to}.followers[]`);
      }
    }
    for (const doc of docs) {
      for (const f of doc.followers || []) {
        if (!ids.has(String(f))) continue;
        if (!edges.has(`${f}->${doc._id}`)) {
          violations.push(`${doc._id}.followers[] has ${f} but no matching following[] entry`);
        }
      }
    }
    return { ok: violations.length === 0, violations };
  }

  try {
    const stamp = Date.now() % 1000000;
    const users = await User.create([
      { name: 'Follow Verify A', username: `folva_${stamp}`, email: `folva_${stamp}@t.com`, password: 'verify_pass_1' },
      { name: 'Follow Verify B', username: `folvb_${stamp}`, email: `folvb_${stamp}@t.com`, password: 'verify_pass_2' },
      { name: 'Follow Verify C', username: `folvc_${stamp}`, email: `folvc_${stamp}@t.com`, password: 'verify_pass_3' },
    ]);
    const [a, b, c] = users;

    let scan = await scanSymmetry(users);
    check('baseline: all user docs start symmetric', scan.ok, JSON.stringify(scan.violations));

    // A -> B (same $addToSet pair as POST /api/users/:id/follow)
    await User.updateOne({ _id: a._id }, { $addToSet: { following: b._id } });
    await User.updateOne({ _id: b._id }, { $addToSet: { followers: a._id } });
    // B -> C and C -> A
    await User.updateOne({ _id: b._id }, { $addToSet: { following: c._id } });
    await User.updateOne({ _id: c._id }, { $addToSet: { followers: b._id } });
    await User.updateOne({ _id: c._id }, { $addToSet: { following: a._id } });
    await User.updateOne({ _id: a._id }, { $addToSet: { followers: c._id } });

    const rawAfter = await mongoose.connection.db
      .collection('users')
      .find({ _id: { $in: users.map((u) => u._id) } })
      .toArray();
    const byId = Object.fromEntries(rawAfter.map((d) => [String(d._id), d]));
    check('A.following[] contains B in raw document', (byId[String(a._id)].following || []).some((x) => String(x) === String(b._id)));
    check('B.followers[] contains A in raw document', (byId[String(b._id)].followers || []).some((x) => String(x) === String(a._id)));
    check('$addToSet kept arrays duplicate-free', (byId[String(a._id)].following || []).length === new Set((byId[String(a._id)].following || []).map(String)).size);

    scan = await scanSymmetry(users);
    check('after 3 follows: all edges symmetric', scan.ok, JSON.stringify(scan.violations));
    check('A counts: 1 following, 1 follower', byId[String(a._id)].following.length === 1 && byId[String(a._id)].followers.length === 1);
    check('C counts: 1 following, 1 follower', byId[String(c._id)].following.length === 1 && byId[String(c._id)].followers.length === 1);

    // Negative control: corrupt ONE side on purpose - scanner must catch it.
    await User.updateOne({ _id: b._id }, { $pull: { followers: a._id } });
    scan = await scanSymmetry(users);
    check('negative control: one-sided write detected as violation', !scan.ok, 'scanner failed to detect asymmetry!');

    // Repair both sides (same $pull pair as DELETE /api/users/:id/follow)
    await User.updateOne({ _id: a._id }, { $pull: { following: b._id } });
    scan = await scanSymmetry(users);
    check('after proper unfollow: symmetric again', scan.ok, JSON.stringify(scan.violations));

    await User.deleteMany({ _id: { $in: users.map((u) => u._id) } });
    const left = await mongoose.connection.db.collection('users').countDocuments({ _id: { $in: users.map((u) => u._id) } });
    check('cleanup: temp users removed from DB', left === 0);
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
