import { getCurrentUser, handleError } from "../../../utils/auth.js";
import { findAutomationForUser } from "../../utils.js";
import { pruneAutomationOutputs } from "../../../utils/automation-retention.mjs";

async function handle(request, { params }, dryRun) {
    try {
        const user = await getCurrentUser();
        const { id } = await params;
        const automation = await findAutomationForUser(id, user._id);
        if (!automation)
            return Response.json(
                { error: "Automation not found" },
                { status: 404 },
            );
        const result = await pruneAutomationOutputs(automation._id, {
            ownerId: user._id,
            dryRun,
        });
        return Response.json(result);
    } catch (error) {
        return handleError(error);
    }
}

export const GET = (request, context) => handle(request, context, true);
export const POST = (request, context) => handle(request, context, false);
