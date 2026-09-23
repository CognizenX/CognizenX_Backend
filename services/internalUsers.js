const User = require('../models/User');

/**
 * Parse a Mongo URI for safe display / production detection.
 * Never returns credentials.
 */
function describeMongoUri(uri) {
  if (!uri || typeof uri !== 'string') {
    return { host: null, dbName: null, isLocal: false, isProductionLike: false };
  }

  try {
    const normalised = uri.replace(/^mongodb(\+srv)?:\/\//, 'http://');
    const parsed = new URL(normalised);
    const host = parsed.host || null;
    const dbName = (parsed.pathname || '').replace(/^\//, '').split('?')[0] || null;
    const isLocal =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      (host && host.startsWith('localhost:'));
    const isProductionLike = !isLocal;

    return { host, dbName, isLocal, isProductionLike };
  } catch (err) {
    return {
      host: null,
      dbName: null,
      isLocal: false,
      isProductionLike: true,
      parseError: err.message,
    };
  }
}

async function getInternalUserIds() {
  const rows = await User.find({ isInternal: true }, { _id: 1 }).lean();
  return rows.map((row) => row._id);
}

/**
 * Merge an exclusion for internal users into a Mongo match object.
 * Default: exclude. Pass { includeInternal: true } to leave match unchanged.
 */
async function excludeInternalUsers(match = {}, options = {}) {
  const { includeInternal = false, userIdField = 'userId' } = options;
  if (includeInternal) {
    return { ...match };
  }

  const internalIds = await getInternalUserIds();
  if (internalIds.length === 0) {
    return { ...match };
  }

  const existing = match[userIdField];
  const exclusion = { $nin: internalIds };

  if (existing == null) {
    return { ...match, [userIdField]: exclusion };
  }

  // Preserve an existing equality / $in constraint by ANDing with $nin.
  return {
    ...match,
    $and: [
      { [userIdField]: existing },
      { [userIdField]: exclusion },
    ],
  };
}

module.exports = {
  describeMongoUri,
  getInternalUserIds,
  excludeInternalUsers,
};
