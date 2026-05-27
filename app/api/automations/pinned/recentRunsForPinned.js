import Task from "../../models/task.mjs";
import {
    AUTOMATION_TASK_TYPE,
    parseAutomationTaskOutput,
    scheduleAutomationRefIdBackfill,
} from "../utils";

const SIDEBAR_RUN_PREVIEW_MAX = 100;
const SIDEBAR_RUN_LIMIT = 15;

function stringifyOutput(val) {
    if (val === undefined || val === null || val === "") {
        return "";
    }
    if (typeof val === "string") {
        return val;
    }
    try {
        return JSON.stringify(val);
    } catch {
        return String(val);
    }
}

function truncatePreviewText(text, maxLen) {
    const n = String(text || "")
        .replace(/\s+/g, " ")
        .trim();
    if (!n) {
        return "";
    }
    if (n.length <= maxLen) {
        return n;
    }
    return `${n.slice(0, maxLen).trim()}…`;
}

function summarizeRunForSidebar(run) {
    const parsed = parseAutomationTaskOutput(run);
    const raw =
        (typeof parsed.summary === "string" &&
            parsed.summary.trim() &&
            parsed.summary) ||
        stringifyOutput(run?.data?.summary) ||
        run?.statusText ||
        run?.error ||
        "";
    return truncatePreviewText(raw, SIDEBAR_RUN_PREVIEW_MAX);
}

function serializeSidebarRun(run) {
    const preview = summarizeRunForSidebar(run);
    return {
        taskId: String(run._id),
        createdAt: run.createdAt ? new Date(run.createdAt).toISOString() : null,
        status: run.status || "pending",
        preview,
    };
}

/**
 * @param {object} params
 * @param {import("mongoose").Types.ObjectId} params.ownerId
 * @param {Array<{ _id: import("mongoose").Types.ObjectId }>} params.automations
 * @returns {Promise<Map<string, Array<{taskId:string,createdAt:string|null,status:string,preview:string}>>>}
 */
export async function fetchRecentRunsByAutomationId({ ownerId, automations }) {
    const mapById = new Map();
    if (!automations?.length) {
        return mapById;
    }

    const ids = automations.map((a) => a._id).filter(Boolean);
    const idSet = new Set(ids.map(String));
    const fetchLimit = Math.min(
        2500,
        Math.max(200, ids.length * SIDEBAR_RUN_LIMIT * 8),
    );

    // CSFLE: do not filter on automation.automationId (analyze_query error 31133).
    // Scan recent automation tasks for this owner and bucket in memory (small N).
    const recent = await Task.find({
        owner: ownerId,
        type: AUTOMATION_TASK_TYPE,
    })
        .sort({ createdAt: -1 })
        .limit(fetchLimit)
        .lean();

    scheduleAutomationRefIdBackfill(recent);

    const buckets = new Map(ids.map((id) => [String(id), []]));
    for (const run of recent) {
        const aid = String(
            run.automationRefId || run.automation?.automationId || "",
        );
        if (!idSet.has(aid)) continue;
        const b = buckets.get(aid);
        if (b.length < SIDEBAR_RUN_LIMIT) b.push(run);
    }

    ids.forEach((automationId) => {
        const key = String(automationId);
        mapById.set(key, (buckets.get(key) || []).map(serializeSidebarRun));
    });
    return mapById;
}
