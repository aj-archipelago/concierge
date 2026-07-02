/* global globalThis */
import SystemMigration, {
    SYSTEM_MIGRATION_STATUS,
} from "../models/system-migration.mjs";
import {
    formatDbErrorForLog,
    getDbRetryDelayMs,
    isCosmosRateLimitError,
} from "./db-retry.mjs";

const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_FAILURE_LEASE_MS = 60 * 1000;
const DEFAULT_CRITICAL_WAIT_TIMEOUT_MS = 2 * 60 * 1000;
const DEFAULT_CRITICAL_POLL_MS = 2 * 1000;
const STARTUP_MIGRATION_OWNER_SUFFIX =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function nowDate(now = Date.now) {
    return new Date(now());
}

function isDuplicateKeyError(error) {
    return (
        error?.code === 11000 || /E11000 duplicate key/i.test(error?.message)
    );
}

function migrationLabel(migration) {
    return migration.name || migration.id;
}

function serializeMigrationError(error) {
    return {
        name: error?.name || "Error",
        message: error?.message || String(error),
        code: error?.code,
    };
}

function buildRunUpdate({ ownerId, now, leaseMs }) {
    const startedAt = nowDate(now);
    return {
        $set: {
            status: SYSTEM_MIGRATION_STATUS.RUNNING,
            ownerId,
            leaseExpiresAt: new Date(startedAt.getTime() + leaseMs),
            startedAt,
            lastAttemptAt: startedAt,
        },
        $inc: { attempts: 1 },
        $unset: {
            completedAt: "",
            error: "",
        },
    };
}

async function acquireMigrationLease(migration, { ownerId, now }) {
    const leaseMs = migration.leaseMs || DEFAULT_LEASE_MS;
    const currentTime = nowDate(now);
    const update = buildRunUpdate({ ownerId, now, leaseMs });

    const acquiredExisting = await SystemMigration.findOneAndUpdate(
        {
            _id: migration.id,
            status: { $ne: SYSTEM_MIGRATION_STATUS.COMPLETE },
            $or: [
                { leaseExpiresAt: { $exists: false } },
                { leaseExpiresAt: null },
                { leaseExpiresAt: { $lte: currentTime } },
            ],
        },
        update,
        { new: true },
    );

    if (acquiredExisting) return acquiredExisting;

    try {
        const startedAt = nowDate(now);
        return await SystemMigration.create({
            _id: migration.id,
            status: SYSTEM_MIGRATION_STATUS.RUNNING,
            ownerId,
            leaseExpiresAt: new Date(startedAt.getTime() + leaseMs),
            startedAt,
            lastAttemptAt: startedAt,
            attempts: 1,
        });
    } catch (error) {
        if (isDuplicateKeyError(error)) return null;
        throw error;
    }
}

async function completeMigration(migration, { ownerId, result, now }) {
    const completedAt = nowDate(now);
    const set = {
        status: SYSTEM_MIGRATION_STATUS.COMPLETE,
        ownerId: null,
        leaseExpiresAt: null,
        completedAt,
    };

    if (result !== undefined) {
        set.result = result;
    }

    return SystemMigration.findOneAndUpdate(
        {
            _id: migration.id,
            status: SYSTEM_MIGRATION_STATUS.RUNNING,
            ownerId,
        },
        {
            $set: set,
            $unset: { error: "" },
        },
        { new: true },
    );
}

async function failMigration(migration, { ownerId, error, now }) {
    const failedAt = nowDate(now);
    const failureLeaseMs = migration.failureLeaseMs ?? DEFAULT_FAILURE_LEASE_MS;

    return SystemMigration.findOneAndUpdate(
        {
            _id: migration.id,
            status: SYSTEM_MIGRATION_STATUS.RUNNING,
            ownerId,
        },
        {
            $set: {
                status: SYSTEM_MIGRATION_STATUS.FAILED,
                ownerId: null,
                leaseExpiresAt: new Date(failedAt.getTime() + failureLeaseMs),
                error: serializeMigrationError(error),
            },
        },
        { new: true },
    );
}

async function getMigrationState(migration) {
    return SystemMigration.findById(migration.id).lean();
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOwnedMigration(migration, options) {
    const label = migrationLabel(migration);

    try {
        const result = await migration.run();
        const completed = await completeMigration(migration, {
            ownerId: options.ownerId,
            result,
            now: options.now,
        });
        if (!completed) {
            console.warn(
                `Startup migration finished after losing lease: ${label}`,
            );
            return {
                id: migration.id,
                status: "skipped",
                reason: "lease_lost",
                ownerId: options.ownerId,
                result,
            };
        }

        console.log(`Startup migration complete: ${label}`);
        return {
            id: migration.id,
            status: "complete",
            ownerId: options.ownerId,
            result,
        };
    } catch (error) {
        let recordedFailure = null;
        let failureRecordError = null;
        try {
            recordedFailure = await failMigration(migration, {
                ownerId: options.ownerId,
                error,
                now: options.now,
            });
        } catch (recordError) {
            failureRecordError = recordError;
            console.error(
                `Failed to record startup migration failure for ${label}:`,
                formatDbErrorForLog(recordError),
            );
        }

        if (!recordedFailure && !failureRecordError) {
            console.warn(
                `Startup migration failed after losing lease: ${label}:`,
                error,
            );
            return {
                id: migration.id,
                status: "skipped",
                reason: "lease_lost",
                ownerId: options.ownerId,
                error,
            };
        }

        if (migration.critical) {
            console.error(
                `Critical startup migration failed: ${label}:`,
                error,
            );
            throw error;
        }

        console.warn(`Non-critical startup migration failed: ${label}:`, error);
        return {
            id: migration.id,
            status: "failed",
            ownerId: options.ownerId,
            error,
        };
    }
}

async function runStartupMigration(migration, options) {
    const label = migrationLabel(migration);
    const startedAt = options.now();
    const waitTimeoutMs =
        migration.waitTimeoutMs ?? DEFAULT_CRITICAL_WAIT_TIMEOUT_MS;
    const pollMs = migration.pollMs ?? DEFAULT_CRITICAL_POLL_MS;

    while (true) {
        let acquired = null;

        try {
            acquired = await acquireMigrationLease(migration, options);
        } catch (error) {
            if (isCosmosRateLimitError(error) && !migration.critical) {
                console.warn(
                    `Skipping non-critical startup migration during Cosmos throttling: ${label}: ${formatDbErrorForLog(error)}`,
                );
                return {
                    id: migration.id,
                    status: "skipped",
                    reason: "rate_limited",
                    error,
                };
            }
            throw error;
        }

        if (acquired) {
            console.log(`Startup migration acquired: ${label}`);
            return runOwnedMigration(migration, options);
        }

        const state = await getMigrationState(migration);
        if (state?.status === SYSTEM_MIGRATION_STATUS.COMPLETE) {
            return {
                id: migration.id,
                status: "skipped",
                reason: "complete",
            };
        }

        if (!migration.critical) {
            console.log(
                `Startup migration already running elsewhere; skipping: ${label}`,
            );
            return {
                id: migration.id,
                status: "skipped",
                reason: "locked",
                ownerId: state?.ownerId,
                leaseExpiresAt: state?.leaseExpiresAt,
            };
        }

        if (options.now() - startedAt >= waitTimeoutMs) {
            throw new Error(
                `Timed out waiting for critical startup migration: ${label}`,
            );
        }

        await options.sleep(
            getDbRetryDelayMs(state?.error, pollMs, Math.max(pollMs, 10_000)),
        );
    }
}

export function createStartupMigrationOwnerId() {
    const env = globalThis.process?.env || {};
    const instanceId =
        env.WEBSITE_INSTANCE_ID ||
        env.HOSTNAME ||
        env.WEBSITE_SITE_NAME ||
        "local";
    return `${instanceId}:${STARTUP_MIGRATION_OWNER_SUFFIX}`;
}

export async function runStartupMigrations(migrations, options = {}) {
    const ownerId = options.ownerId || createStartupMigrationOwnerId();
    const results = [];
    const runnerOptions = {
        ownerId,
        now: options.now || Date.now,
        sleep: options.sleep || sleep,
    };

    for (const migration of migrations) {
        if (!migration?.id || typeof migration.run !== "function") {
            throw new Error(
                "Startup migrations require an id and run function",
            );
        }

        results.push(await runStartupMigration(migration, runnerOptions));
    }

    return results;
}

export { SYSTEM_MIGRATION_STATUS };
