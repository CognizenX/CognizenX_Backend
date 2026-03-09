#!/usr/bin/env node

require("dotenv").config();

const path = require("path");
const { connectDatabase } = require("../../config/database");
const {
  exportTriviaAttemptsRaw,
  exportDailyTopicMetrics,
  exportUsersAnonymized,
} = require("./exporters");

function printHelp(exitCode = 0) {
  const msg = `
Usage:
  node scripts/analytics/cli.js export [options]

Options:
  --out <dir>         Output directory (default: CognizenX_Backend/exports)
  --since <YYYY-MM-DD>  Inclusive start date (UTC) for attemptedAt filtering
  --until <YYYY-MM-DD>  Exclusive end date (UTC) for attemptedAt filtering
  --raw               Export raw trivia attempts (jsonl)
  --daily             Export daily topic metrics (csv)
  --users             Export anonymized user table (csv)
  --salt <string>     Salt for hashing user ids (or set ANALYTICS_SALT)
  -h, --help          Show help

Examples:
  node scripts/analytics/cli.js export --daily --users
  node scripts/analytics/cli.js export --since 2026-01-01 --until 2026-02-01 --daily
  node scripts/analytics/cli.js export --raw --out ./exports
`;
  process.stdout.write(msg);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;

    if (token === "-h" || token === "--help") {
      args.help = true;
      continue;
    }

    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];

    if (key === "raw" || key === "daily" || key === "users") {
      args[key] = true;
      continue;
    }

    if (next == null || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    i += 1;
  }
  return args;
}

function parseDateOnlyUtc(value, label) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD (got: ${value})`);
  }
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${label} is not a valid date: ${value}`);
  }
  return d;
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.help) printHelp(0);

  const command = args._[0];
  if (!command) printHelp(1);

  if (command !== "export") {
    process.stderr.write(`Unknown command: ${command}\n`);
    printHelp(1);
  }

  const outDir = path.resolve(
    args.out || path.join(__dirname, "..", "..", "exports")
  );

  const since = parseDateOnlyUtc(args.since, "--since");
  const until = parseDateOnlyUtc(args.until, "--until");

  const doRaw = Boolean(args.raw);
  const doDaily = Boolean(args.daily);
  const doUsers = Boolean(args.users);

  if (!doRaw && !doDaily && !doUsers) {
    process.stderr.write(
      "Nothing to export. Provide at least one of: --raw, --daily, --users\n"
    );
    printHelp(1);
  }

  const salt = args.salt || process.env.ANALYTICS_SALT || "";

  await connectDatabase();

  const filter = { since, until };

  if (doRaw) {
    await exportTriviaAttemptsRaw({ outDir, filter, salt });
  }
  if (doDaily) {
    await exportDailyTopicMetrics({ outDir, filter });
  }
  if (doUsers) {
    await exportUsersAnonymized({ outDir, salt });
  }

  process.stdout.write(`\nDone. Outputs in: ${outDir}\n`);
}

main().catch((err) => {
  process.stderr.write(`\nAnalytics export failed: ${err?.stack || err}\n`);
  process.exit(1);
});
