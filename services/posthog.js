const { PostHog } = require("posthog-node");

const CRON_DISTINCT_ID = "mindmitra_cron";

let client = null;

function getClient() {
  if (client) return client;

  const apiKey = process.env.POSTHOG_PROJECT_TOKEN;
  const host = process.env.POSTHOG_HOST || "https://us.i.posthog.com";
  if (!apiKey) {
    return null;
  }

  client = new PostHog(apiKey, {
    host,
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

function capture(distinctId, event, properties = {}) {
  const ph = getClient();
  if (!ph) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[posthog] skipped capture (POSTHOG_PROJECT_TOKEN unset):", event);
    }
    return;
  }

  ph.capture({
    distinctId: String(distinctId),
    event,
    properties,
  });
}

function identify(distinctId, properties = {}) {
  const ph = getClient();
  if (!ph) return;

  ph.identify({
    distinctId: String(distinctId),
    properties,
  });
}

async function shutdown() {
  if (!client) return;
  try {
    await client.shutdown();
  } catch (error) {
    console.warn("[posthog] shutdown failed:", error?.message || error);
  }
}

/**
 * Best-effort GDPR person delete. Requires POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID.
 * Full account-deletion wiring is completed in P0.9; this is the hook P0.3 leaves ready.
 */
async function deletePersonByDistinctId(distinctId) {
  const personalKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const host = (process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(
    ".i.posthog.com",
    ".posthog.com"
  );

  if (!personalKey || !projectId || !distinctId) {
    return { skipped: true };
  }

  const url = `${host}/api/projects/${projectId}/persons/?distinct_id=${encodeURIComponent(
    String(distinctId)
  )}&delete_events=true`;

  const resp = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${personalKey}`,
    },
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`PostHog person delete failed (${resp.status}): ${body}`);
  }

  return { deleted: true };
}

module.exports = {
  CRON_DISTINCT_ID,
  capture,
  identify,
  shutdown,
  deletePersonByDistinctId,
  getClient,
};
