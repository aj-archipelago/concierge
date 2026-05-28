import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser, handleError } from "../../../../../utils/auth";
import Task from "../../../../../models/task.mjs";
import {
    applyAutomationHtmlTheme,
    AUTOMATION_TASK_TYPE,
    findAutomationForUser,
    parseAutomationTaskOutput,
    sanitizeGeneratedHtml,
    scheduleAutomationRefIdBackfill,
} from "../../../../utils";
import { readBlobContent } from "../../../../../utils/media-service-utils";
import { createAutomationStorageTarget } from "../../../../../../../src/utils/storageTargets";

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

        let task = null;
        if (params.taskId === "latest" && !automation.latestRunTaskId) {
            let candidates = await Task.find({
                owner: user._id,
                type: AUTOMATION_TASK_TYPE,
                automationRefId: automation._id,
            });
            if (!candidates.length) {
                const recent = await Task.find({
                    owner: user._id,
                    type: AUTOMATION_TASK_TYPE,
                })
                    .sort({ createdAt: -1 })
                    .limit(150)
                    .lean();
                scheduleAutomationRefIdBackfill(recent);
                const idStr = String(automation._id);
                candidates = recent.filter(
                    (t) =>
                        String(
                            t.automationRefId ||
                                t.automation?.automationId ||
                                "",
                        ) === idStr,
                );
            }
            candidates.sort(
                (a, b) =>
                    new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
            );
            task = candidates.find((candidate) => {
                if (candidate?.automation?.htmlOutputPath) return true;
                return Boolean(parseAutomationTaskOutput(candidate).html);
            });
        } else {
            const taskId =
                params.taskId === "latest"
                    ? automation.latestRunTaskId
                    : params.taskId;

            if (!taskId) {
                return NextResponse.json(
                    { error: "No HTML run is available yet" },
                    { status: 404 },
                );
            }

            task = await Task.findOne({
                _id: taskId,
                owner: user._id,
                automationRefId: automation._id,
            });
            if (!task) {
                const loose = await Task.findOne({
                    _id: taskId,
                    owner: user._id,
                });
                if (
                    loose &&
                    String(
                        loose.automationRefId ||
                            loose.automation?.automationId ||
                            "",
                    ) === String(automation._id)
                ) {
                    task = loose;
                    scheduleAutomationRefIdBackfill([loose]);
                }
            }
        }

        let html = "";
        if (task?.automation?.htmlOutputPath) {
            const storageTarget = createAutomationStorageTarget(user.contextId);
            html = await readBlobContent(
                task.automation.htmlOutputPath,
                storageTarget,
            );
        } else {
            const parsed = parseAutomationTaskOutput(task);
            html = parsed.html ? sanitizeGeneratedHtml(parsed.html) : "";
        }

        if (!html) {
            return NextResponse.json(
                { error: "HTML output not found" },
                { status: 404 },
            );
        }
        const theme =
            (await cookies()).get("theme")?.value === "dark" ? "dark" : "light";
        const themedHtml = applyAutomationHtmlTheme(html, theme);

        return new NextResponse(themedHtml, {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Content-Security-Policy":
                    "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data: https:;",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic";
