import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../../../utils/auth";
import { createBackgroundTask } from "../../../utils/tasks";
import {
    AUTOMATION_TASK_TYPE,
    findAutomationForUser,
    hasActiveAutomationRun,
} from "../../utils";

export async function POST(request, { params }) {
    try {
        const user = await getCurrentUser();
        const automation = await findAutomationForUser(params.id, user._id);

        if (!automation) {
            return NextResponse.json(
                { error: "Automation not found" },
                { status: 404 },
            );
        }

        const body = await request.json().catch(() => ({}));
        const activeRun = await hasActiveAutomationRun(
            automation._id,
            user._id,
        );
        if (activeRun && !body.force) {
            return NextResponse.json(
                { error: "Automation already has a run in progress" },
                { status: 409 },
            );
        }

        const scheduledFor = new Date();
        const result = await createBackgroundTask({
            userId: user._id,
            type: AUTOMATION_TASK_TYPE,
            timeout: 15 * 60 * 1000,
            metadata: {
                automationId: automation._id.toString(),
                automationName: automation.name,
                automationSlug: automation.slug,
                trigger: "manual",
                scheduledFor,
                inputs: body.inputs || automation.inputs || null,
            },
            invokedFrom: { source: "automation" },
            automation: {
                automationId: automation._id,
                trigger: "manual",
                scheduledFor,
            },
        });

        return NextResponse.json({
            taskId: result.taskId,
            jobId: result.job.id,
        });
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic";
