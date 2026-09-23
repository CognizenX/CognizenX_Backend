/**
 * Flag or unflag a user as internal by email.
 *
 *   node scripts/set-internal-user.js you@example.com
 *   node scripts/set-internal-user.js you@example.com --external
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const makeExternal = process.argv.includes('--external');

  if (!email) {
    console.error('Usage: node scripts/set-internal-user.js <email> [--external]');
    process.exit(1);
  }

  const uri = process.env.MONGO_URI || process.env.MONGO_URL;
  if (!uri) {
    console.error('ERROR: MONGO_URI or MONGO_URL is required.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const user = await User.findOne({ email });
  if (!user) {
    console.error(`No user found: ${email}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const previous = Boolean(user.isInternal);
  user.isInternal = !makeExternal;
  await user.save();

  console.log(
    `${email}: isInternal ${previous} → ${user.isInternal}` +
      (makeExternal ? ' (--external)' : '')
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
