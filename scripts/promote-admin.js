/**
 * Promote a user to admin by email.
 *
 * Usage:
 *   node scripts/promote-admin.js you@example.com
 *   ADMIN_BOOTSTRAP_EMAIL=you@example.com node scripts/promote-admin.js
 *
 * Requires MONGO_URI / MONGO_URL in the environment (or .env).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function main() {
  const email = (process.argv[2] || process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: node scripts/promote-admin.js <email>');
    console.error('   or: ADMIN_BOOTSTRAP_EMAIL=<email> node scripts/promote-admin.js');
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
    console.error(`No user found with email: ${email}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const previous = user.role || 'user';
  user.role = 'admin';
  await user.save();

  console.log(`Promoted ${email} from role="${previous}" to role="admin" (id=${user._id})`);
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
