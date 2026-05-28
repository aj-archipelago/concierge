import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../../../utils/auth";
import Task from "../../../models/task.mjs";
import {
    checkAndUpdateAbandonedTask,
    syncTaskWithBullMQJob,
} from "../../../utils/task-utils.mjs";
import {
    AUTOMATION_TASK_TYPE,
    buildHtmlPreview,
    findAutomationForUser,
    parseAutomationTaskOutput,
    sanitizeGeneratedHtml,
    scheduleAutomationRefIdBackfill,
} from "../../utils";

function enrichRunForHtmlOutput(run, automation) {
    const obj =
        typeof run?.toObject === "function"
            ? run.toObject({ virtuals: true })
            : run;

    if (!automation.producesHtml) {
        return obj;
    }

    const parsed = parseAutomationTaskOutput(obj);
    const sanitizedHtml = parsed.html ? sanitizeGeneratedHtml(parsed.html) : "";

    return {
        ...obj,
        data: {
            ...obj.data,
            summary: parsed.summary || obj?.data?.summary,
        },
        automation: {
            ...obj.automation,
            hasHtmlOutput: Boolean(
                obj?.automation?.htmlOutputPath || sanitizedHtml,
            ),
            htmlOutputPreview:
                obj?.automation?.htmlOutputPreview ||
                (sanitizedHtml ? buildHtmlPreview(sanitizedHtml) : undefined),
        },
    };
}

export async function GET(request, { params }) {
    params = await params;
    try {
        const user = await getCurrentUser();
        const automation = await findAutomationForUser(params.id, user._id);

        if (!automation) {
            return NextResponse.json(
                { error: "Automation not found" },
                { status: 404 },
            );
        }

        const { searchParams } = new URL(request.url);
        const page = Math.max(
            1,
            Number.parseInt(searchParams.get("page"), 10) || 1,
        );
        const limit = Math.min(
            50,
            Math.max(1, Number.parseInt(searchParams.get("limit"), 10) || 20),
        );

        const query = {
            owner: user._id,
            type: AUTOMATION_TASK_TYPE,
            automationRefId: automation._id,
        };

        let total = await Task.countDocuments(query);
        let runs;

        if (total > 0) {
            runs = await Task.find(query)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit);
        } else {
            const windowSize = Math.min(1200, page * limit * 10 + 200);
            const recent = await Task.find({
                owner: user._id,
                type: AUTOMATION_TASK_TYPE,
            })
                .sort({ createdAt: -1 })
                .limit(windowSize)
                .lean();

            scheduleAutomationRefIdBackfill(recent);

            const idStr = String(automation._id);
            const matching = recent.filter(
                (t) =>
                    String(
                        t.automationRefId || t.automation?.automationId || "",
                    ) === idStr,
            );
            total = matching.length;
            const pageSlice = matching.slice((page - 1) * limit, page * limit);
            const pageIds = pageSlice.map((d) => d._id).filter(Boolean);
            runs =
                pageIds.length > 0
                    ? await Task.find({
                          _id: { $in: pageIds },
                          owner: user._id,
                      }).sort({ createdAt: -1 })
                    : [];
        }

        await Promise.all(runs.map((task) => syncTaskWithBullMQJob(task)));
        const updatedRuns = await Promise.all(
            runs.map((task) => checkAndUpdateAbandonedTask(task)),
        );
        const enrichedRuns = updatedRuns.map((run) =>
            enrichRunForHtmlOutput(run, automation),
        );

        return NextResponse.json({
            runs: enrichedRuns,
            hasMore: total > page * limit,
            total,
        });
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic";
