/**
 * P0.9 — purge behavioural rows whose userId no longer exists.
 *
 *   node scripts/script_P0/sweep-orphan-user-data.js
 *   node scripts/script_P0/sweep-orphan-user-data.js --confirm --confirm-production
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { describeMongoUri } = require("../../services/internalUsers");
const { sweepOrphanUserData } = require("../../services/deleteUserCascade");

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

async function main() {
  const argv = process.argv.slice(2);
  const confirm = hasFlag(argv, "--confirm");
  const confirmProduction = hasFlag(argv, "--confirm-production");
  const uri = process.env.MONGO_URI || process.env.MONGO_URL;
  if (!uri) throw new Error("MONGO_URI is not set");

  const meta = describeMongoUri(uri);
  console.log(`Host: ${meta.host}`);
  console.log(`DB:   ${meta.dbName}`);
  console.log(`Local?: ${meta.isLocal}`);

  if (confirm && !meta.isLocal && !confirmProduction) {
    console.error(
      "\nRefusing to mutate a non-localhost URI without --confirm-production.\n" +
        "Re-run with: --confirm --confirm-production\n"
    );
    process.exit(1);
  }

  await mongoose.connect(uri);
  const result = await sweepOrphanUserData({ dryRun: !confirm });

  const dir = path.join(__dirname, "..", "..", "reports", "Reports_p0");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(dir, `orphan-sweep-${stamp}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        uri: { host: meta.host, dbName: meta.dbName, isLocal: meta.isLocal },
        ...result,
      },
      null,
      2
    )
  );

  console.log(JSON.stringify(result, null, 2));
  console.log(`report ${outPath}`);
  if (!confirm) {
    console.log("\nDry-run only. Re-run with --confirm [--confirm-production] to delete.\n");
  }
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
