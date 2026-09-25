import {
    claimAutomationDispatch,
    releaseAutomationDispatch,
} from "../../../utils/automation-dispatch-lock.mjs";
import { NextResponse } from "next/server";
import { getCurrentUser, handleError } from "../../../utils/auth";
import { createBackgroundTask } from "../../../utils/tasks";
import {
    AUTOMATION_TASK_TYPE,
    findAutomationForEditor,
    hasActiveAutomationRun,
} from "../../utils";

export async function POST(request, { params }) {
    params = await params;
    try {
        const user = await getCurrentUser();
        const found = await findAutomationForEditor(params.id, user._id);

        if (!found) {
            return NextResponse.json(
                { error: "Automation not found" },
                { status: 404 },
            );
        }

        const { automation } = found;
        const body = await request.json().catch(() => ({}));
        const claimed = await claimAutomationDispatch(automation._id, {
            owner: automation.owner,
        });
        if (!claimed)
            return NextResponse.json(
                { error: "Automation dispatch is already in progress" },
                { status: 409 },
            );
        try {
            const activeRun = await hasActiveAutomationRun(
                automation._id,
                automation.owner,
            );
            if (activeRun && !body.force) {
                return NextResponse.json(
                    { error: "Automation already has a run in progress" },
                    { status: 409 },
                );
            }

            const scheduledFor = new Date();
            const result = await createBackgroundTask({
                userId: automation.owner,
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
                jobId: result.job?.id,
            });
        } finally {
            await releaseAutomationDispatch(claimed);
        }
    } catch (error) {
        return handleError(error);
    }
}

export const dynamic = "force-dynamic";
