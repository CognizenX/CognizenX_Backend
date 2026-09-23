/**
 * P0.2 — Flag existing users as internal, archive behavioural data, then purge live rows.
 *
 * Default is dry-run (no writes).
 *
 * Usage:
 *   node scripts/flag-and-purge-internal-data.js
 *   node scripts/flag-and-purge-internal-data.js --confirm --confirm-production
 *
 * Flags:
 *   --confirm              Perform archive + purge + flag (required to mutate)
 *   --confirm-production   Required when URI host is not localhost
 *   --stamp=YYYYMMDDTHHMMSS Optional archive name stamp (default: UTC now)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const User = require('../models/User');
const TriviaAttempt = require('../models/TriviaAttempt');
const UserQuestionStats = require('../models/UserQuestionStats');
const GameSession = require('../models/GameSession');
const Report = require('../models/Report');
const UserActivity = require('../models/UserActivity');
const SubDomainDemandSnapshot = require('../models/SubDomainDemandSnapshot');
const SchedulerMetadata = require('../models/SchedulerMetadata');
const { describeMongoUri } = require('../services/internalUsers');
const { buildGenerationPlan } = require('../services/generationPlan');

const BEHAVIOURAL = [
  { key: 'triviaattempts', model: TriviaAttempt, userField: 'userId' },
  { key: 'userquestionstats', model: UserQuestionStats, userField: 'userId' },
  { key: 'gamesessions', model: GameSession, userField: 'userId' },
  { key: 'reports', model: Report, userField: 'userId' },
  { key: 'useractivities', model: UserActivity, userField: 'userId' },
];

// Pre-launch: every existing account is test. Archive + empty entire behavioural
// collections (including orphan rows whose userId no longer exists).
const ARCHIVE_ENTIRE_BEHAVIOURAL = true;

function hasFlag(argv, name) {
  return argv.includes(name);
}

function getArgValue(argv, name) {
  const prefix = `${name}=`;
  const hit = argv.find((arg) => arg.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

function utcStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

function archiveName(base, stamp) {
  return `${base}_internal_archive_${stamp}`;
}

async function countForUsers(model, userField, userIds) {
  if (userIds.length === 0) return 0;
  return model.countDocuments({ [userField]: { $in: userIds } });
}

async function archiveCollection({ db, sourceName, destName, userField, userIds, entire }) {
  const source = db.collection(sourceName);
  const existing = await db.listCollections({ name: destName }).toArray();
  if (existing.length > 0) {
    throw new Error(`Archive collection already exists: ${destName}. Choose a new --stamp.`);
  }

  const match = entire ? {} : { [userField]: { $in: userIds } };
  const sourceCount = await source.countDocuments(match);

  if (sourceCount === 0) {
    await db.createCollection(destName);
    return { archived: 0 };
  }

  await source.aggregate([{ $match: match }, { $out: destName }]).toArray();
  const archived = await db.collection(destName).countDocuments();
  return { archived };
}

async function main() {
  const argv = process.argv.slice(2);
  const confirm = hasFlag(argv, '--confirm');
  const confirmProduction = hasFlag(argv, '--confirm-production');
  const stamp = getArgValue(argv, '--stamp') || utcStamp();

  const uri = process.env.MONGO_URI || process.env.MONGO_URL;
  if (!uri) {
    console.error('ERROR: MONGO_URI or MONGO_URL is required.');
    process.exit(1);
  }

  const meta = describeMongoUri(uri);
  console.log('\n=== P0.2 internal data archive + purge ===');
  console.log(`Mode: ${confirm ? 'CONFIRM (will mutate)' : 'DRY-RUN (no writes)'}`);
  console.log(`URI host: ${meta.host || '(unparsed)'}`);
  console.log(`URI db:   ${meta.dbName || '(unparsed)'}`);
  console.log(`Local?:   ${meta.isLocal}`);
  console.log(`Stamp:    ${stamp}`);

  if (meta.parseError) {
    console.warn(`URI parse warning: ${meta.parseError}`);
  }

  if (confirm && meta.isProductionLike && !confirmProduction) {
    console.error(
      '\nRefusing to mutate a non-localhost URI without --confirm-production.\n' +
        'Re-run with: --confirm --confirm-production\n'
    );
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const allUsers = await User.find({}, { _id: 1, email: 1, isInternal: 1 }).lean();
  const userIds = allUsers.map((u) => u._id);
  const alreadyInternal = allUsers.filter((u) => u.isInternal).length;

  const counts = {};
  for (const entry of BEHAVIOURAL) {
    const liveName = entry.model.collection.name;
    const totalRows = await entry.model.countDocuments({});
    const matchingRows = await countForUsers(entry.model, entry.userField, userIds);
    counts[entry.key] = {
      liveCollection: liveName,
      archiveCollection: archiveName(liveName, stamp),
      matchingRows,
      orphanRows: Math.max(0, totalRows - matchingRows),
      totalRows,
      rowsToArchive: ARCHIVE_ENTIRE_BEHAVIOURAL ? totalRows : matchingRows,
    };
  }

  const demandCount = await SubDomainDemandSnapshot.countDocuments({});
  const exhaustionSignals = await SchedulerMetadata.countDocuments({
    metadataType: 'userExhaustionSignal',
  });

  const report = {
    generatedAt: new Date().toISOString(),
    mode: confirm ? 'confirm' : 'dry-run',
    uri: { host: meta.host, dbName: meta.dbName, isLocal: meta.isLocal },
    stamp,
    archiveEntireBehavioural: ARCHIVE_ENTIRE_BEHAVIOURAL,
    users: {
      total: allUsers.length,
      alreadyInternal,
      willFlagInternal: allUsers.length,
    },
    behavioural: counts,
    demandSnapshots: demandCount,
    userExhaustionSignals: exhaustionSignals,
    actions: confirm
      ? [
          ARCHIVE_ENTIRE_BEHAVIOURAL
            ? 'archive entire behavioural collections (includes orphans)'
            : 'archive behavioural rows for existing users',
          ARCHIVE_ENTIRE_BEHAVIOURAL
            ? 'empty live behavioural collections'
            : 'delete behavioural rows for existing users from live collections',
          'set isInternal=true on all existing users',
          'delete SubDomainDemandSnapshot rows',
          'delete userExhaustionSignal SchedulerMetadata rows',
          'rebuild demand snapshots via buildGenerationPlan (coverage-only with zero activity)',
        ]
      : ['none (dry-run)'],
  };

  console.log('\nUsers:', report.users);
  console.log(`\nArchive mode: ${ARCHIVE_ENTIRE_BEHAVIOURAL ? 'ENTIRE behavioural collections' : 'per-user match only'}`);
  console.log('\nBehavioural collections:');
  for (const [key, info] of Object.entries(counts)) {
    console.log(
      `  ${key}: archive ${info.rowsToArchive} (matched=${info.matchingRows}, orphans=${info.orphanRows}, total=${info.totalRows}) → ${info.archiveCollection}`
    );
  }
  console.log(`Demand snapshots: ${demandCount}`);
  console.log(`User exhaustion signals: ${exhaustionSignals}`);

  const reportsDir = path.join(__dirname, '..', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(
    reportsDir,
    `internal-purge-${confirm ? 'confirm' : 'dry-run'}-${stamp}.json`
  );

  if (!confirm) {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nDry-run report written: ${reportPath}`);
    console.log('No data changed. Re-run with --confirm [--confirm-production] to apply.\n');
    await mongoose.disconnect();
    return;
  }

  const archiveResults = {};
  for (const entry of BEHAVIOURAL) {
    const liveName = entry.model.collection.name;
    const destName = archiveName(liveName, stamp);
    console.log(`\nArchiving ${liveName} → ${destName} ...`);
    const result = await archiveCollection({
      db,
      sourceName: liveName,
      destName,
      userField: entry.userField,
      userIds,
      entire: ARCHIVE_ENTIRE_BEHAVIOURAL,
    });
    archiveResults[entry.key] = result;

    const expected = counts[entry.key].rowsToArchive;
    if (result.archived !== expected) {
      throw new Error(
        `Archive count mismatch for ${liveName}: expected ${expected}, got ${result.archived}. Aborting before delete.`
      );
    }
  }

  const deleteResults = {};
  for (const entry of BEHAVIOURAL) {
    const res = ARCHIVE_ENTIRE_BEHAVIOURAL
      ? await entry.model.deleteMany({})
      : await entry.model.deleteMany({ [entry.userField]: { $in: userIds } });
    deleteResults[entry.key] = res.deletedCount;
    console.log(`Deleted from ${entry.model.collection.name}: ${res.deletedCount}`);
  }

  const flagResult = await User.updateMany({}, { $set: { isInternal: true } });
  console.log(`Flagged users isInternal=true: matched=${flagResult.matchedCount}, modified=${flagResult.modifiedCount}`);

  const demandDelete = await SubDomainDemandSnapshot.deleteMany({});
  const signalDelete = await SchedulerMetadata.deleteMany({
    metadataType: 'userExhaustionSignal',
  });
  console.log(`Cleared demand snapshots: ${demandDelete.deletedCount}`);
  console.log(`Cleared userExhaustionSignal metadata: ${signalDelete.deletedCount}`);

  console.log('\nRebuilding demand snapshots (expect coverage-based / empty activity)...');
  const planResult = await buildGenerationPlan({
    now: new Date(),
    cronRunId: `p0.2-rebuild-${stamp}`,
  });

  report.archiveResults = archiveResults;
  report.deleteResults = deleteResults;
  report.usersFlagged = {
    matched: flagResult.matchedCount,
    modified: flagResult.modifiedCount,
  };
  report.demandCleared = demandDelete.deletedCount;
  report.exhaustionSignalsCleared = signalDelete.deletedCount;
  report.rebuild = {
    cronRunId: `p0.2-rebuild-${stamp}`,
    snapshots: planResult.snapshots?.length || 0,
    totalPlanned: planResult.totalPlanned,
    planSize: planResult.plan?.length || 0,
  };

  // Post-conditions
  report.after = {
    internalUsers: await User.countDocuments({ isInternal: true }),
    live: {},
  };
  for (const entry of BEHAVIOURAL) {
    report.after.live[entry.key] = await entry.model.countDocuments({});
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nConfirm report written: ${reportPath}`);
  console.log('Done.\n');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\nFAILED:', err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
