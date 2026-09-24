import Automation from "../models/automation.js";
import Task from "../models/task.mjs";
import User from "../models/user.mjs";
import File from "../models/file.js";
import { retainedRunLimit } from "../../../src/utils/taskOutputRetention.js";
import { authorizedMediaFetch } from "./cfh-client.mjs";
import { taskOutputDirectory } from "./task-html-output.mjs";
import {
    claimAutomationDispatch,
    releaseAutomationDispatch,
} from "./automation-dispatch-lock.mjs";

const BATCH_SIZE = 100;
const RUN_TYPE = "automation-run";

function runQuery(automation) {
    return {
        owner: automation.owner,
        type: RUN_TYPE,
        automationRefId: automation._id,
    };
}

// Only published reports and designated files in server-issued attempt
// directories belong to this policy. Never delete folders or arbitrary files.
export function retainedOutputPaths(automation, run) {
    if (
        !/^[a-z0-9][a-z0-9-]{0,63}$/.test(automation.slug) ||
        !/^[a-f0-9]{24}$/.test(String(run._id))
    )
        return null;
    const prefix = `automations/${automation.slug}/outputs/${run._id}`;
    const output = run.automation || {};
    if (output.outputPath && output.outputPath !== prefix) return null;
    const paths = [];
    for (const [field, filename] of [
        ["htmlOutputPath", "index.html"],
        ["widgetHtmlOutputPath", "widget.html"],
    ]) {
        if (!output[field]) continue;
        if (output[field] !== `${prefix}/${filename}`) return null;
        paths.push(output[field]);
    }
    const attempts =
        run.metadata?.outputAttemptIds ||
        (run.metadata?.outputAttemptId ? [run.metadata.outputAttemptId] : []);
    if (!Array.isArray(attempts) || attempts.length > 64) return null;
    for (const attempt of new Set(attempts)) {
        const directory = taskOutputDirectory(prefix, attempt);
        if (!directory) return null;
        for (const filename of ["result.json", "index.html", "widget.html"]) {
            paths.push(`${directory}/${filename}`);
        }
    }
    return paths;
}

export async function planAutomationRetention(automation) {
    const keep = retainedRunLimit(automation.retainedRuns);
    if (!keep) return { keep, candidates: [] };
    const query = { ...runQuery(automation), status: "completed" };
    const newest = await Task.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .limit(keep)
        .select("_id")
        .lean();
    const protectedIds = newest.map((run) => run._id);
    if (automation.latestRunTaskId)
        protectedIds.push(automation.latestRunTaskId);
    const candidateQuery = {
        ...query,
        _id: { $nin: protectedIds },
        outputExpiredAt: null,
    };
    const currentPaths = new Set(
        [
            automation.latestHtmlOutputPath,
            automation.latestWidgetHtmlOutputPath,
        ].filter(Boolean),
    );
    const candidates = [];
    // Walk past protected/legacy records so they cannot block later cleanup.
    for (let offset = 0; candidates.length < BATCH_SIZE; offset += BATCH_SIZE) {
        const runs = await Task.find(candidateQuery)
            .sort({ createdAt: 1, _id: 1 })
            .skip(offset)
            .limit(BATCH_SIZE)
            .select("automation createdAt metadata")
            .lean();
        for (const run of runs) {
            const paths = retainedOutputPaths(automation, run);
            if (!paths || paths.some((path) => currentPaths.has(path)))
                continue;
            // A saved file reference is an explicit reason to retain this output.
            if (
                paths.length &&
                (await File.exists({
                    owner: automation.owner,
                    blobPath: { $in: paths },
                }))
            )
                continue;
            candidates.push({ taskId: run._id, paths });
            if (candidates.length === BATCH_SIZE) break;
        }
        if (runs.length < BATCH_SIZE) break;
    }
    return { keep, candidates };
}

async function deleteOutput(contextId, blobPath) {
    const url = new URL(process.env.CORTEX_MEDIA_API_URL);
    url.searchParams.set("blobPath", blobPath);
    url.searchParams.set("contextId", contextId);
    url.searchParams.set("fileScope", "automations");
    const response = await authorizedMediaFetch(
        url.toString(),
        {
            method: "DELETE",
            signal: AbortSignal.timeout(10_000),
        },
        {
            user: { contextId },
            routing: { contextId, fileScope: "automations" },
            targets: [
                { owner: contextId, path: blobPath, actions: ["delete"] },
            ],
        },
    );
    // A retry after deletion but before the database update is safe.
    if (!response.ok && response.status !== 404) {
        throw new Error(`Output deletion failed (${response.status})`);
    }
    await response.body?.cancel();
    return response.status !== 404;
}

export async function pruneAutomationOutputs(
    id,
    { ownerId, dryRun = false } = {},
) {
    // Next dev can reuse a compiled Mongoose model across a schema hot reload.
    // Refuse cleanup if it would silently drop the policy or expiry marker.
    if (
        !dryRun &&
        (!Task.schema.path("outputExpiredAt") ||
            !Automation.schema.path("retainedRuns"))
    ) {
        throw new Error(
            "Reload database models before applying output retention",
        );
    }
    const filter = ownerId ? { owner: ownerId } : {};
    const automation = dryRun
        ? await Automation.findOne({ _id: id, ...filter })
        : await claimAutomationDispatch(id, filter, { timestamps: false });
    if (!automation)
        return { skipped: "unavailable", expiredRuns: 0, deletedFiles: 0 };
    try {
        if (
            await Task.exists({
                ...runQuery(automation),
                status: { $in: ["pending", "in_progress", "waiting"] },
            })
        ) {
            return { skipped: "active-run", expiredRuns: 0, deletedFiles: 0 };
        }
        const plan = await planAutomationRetention(automation);
        if (dryRun) return plan;
        const result = {
            keep: plan.keep,
            expiredRuns: 0,
            deletedFiles: 0,
            errors: [],
        };
        if (!plan.candidates.length) return result;
        const owner = await User.findById(automation.owner)
            .select("contextId")
            .lean();
        if (!owner?.contextId) return { ...result, skipped: "missing-storage" };
        // Keep each dispatch lock well within its ten-minute lease. Continue
        // the backlog on the next sweep, without delaying task execution.
        const deadline = Date.now() + 60_000;
        for (const candidate of plan.candidates) {
            if (Date.now() >= deadline) break;
            const current = await Automation.findOne({
                _id: id,
                schedulerLockToken: automation.schedulerLockToken,
            })
                .select("retainedRuns")
                .lean();
            if (
                !current ||
                retainedRunLimit(current.retainedRuns) !== plan.keep
            )
                break;
            try {
                for (const path of candidate.paths) {
                    if (await deleteOutput(owner.contextId, path))
                        result.deletedFiles++;
                }
                const updated = await Task.updateOne(
                    {
                        ...runQuery(automation),
                        _id: candidate.taskId,
                        status: "completed",
                        outputExpiredAt: null,
                    },
                    {
                        $set: { outputExpiredAt: new Date() },
                        $unset: {
                            data: 1,
                            "automation.outputPath": 1,
                            "automation.htmlOutputPath": 1,
                            "automation.widgetHtmlOutputPath": 1,
                            "automation.htmlOutputPreview": 1,
                        },
                    },
                    { timestamps: false },
                );
                result.expiredRuns += updated.modifiedCount;
            } catch (error) {
                result.errors.push({
                    taskId: String(candidate.taskId),
                    error: error.message,
                });
            }
        }
        return result;
    } finally {
        if (!dryRun)
            await releaseAutomationDispatch(
                automation,
                {},
                { timestamps: false },
            );
    }
}
