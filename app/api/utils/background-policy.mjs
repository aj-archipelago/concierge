// These limits apply across replicas, not once per worker. Interactive tasks
// never acquire this budget. Keep the same values on every worker replica.
export const BACKGROUND_TYPES = new Set(["build-digest", "automation-run"]);
export const BACKGROUND_RUNTIME_MS = 20 * 60 * 1000;
export const BACKGROUND_LEASE_MS = BACKGROUND_RUNTIME_MS + 60 * 1000;
export const BACKGROUND_CONCURRENCY = 6;
export const BACKGROUND_DEFER_MS = 15_000;

export const isBoundedBackgroundTask = (type) => BACKGROUND_TYPES.has(type);

// Assistant invocations share a separate, replica-wide budget so a team can
// work in parallel without occupying every worker slot or delaying interactive work.
export const ASSISTANT_CONCURRENCY = 12;
export const ASSISTANT_USER_CONCURRENCY = 4;
export const ASSISTANT_WORKFLOW_CONCURRENCY = 4;
