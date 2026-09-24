import { getCurrentUser } from "../../utils/auth";
import {
    colleagueRequest,
    withEntityDefaults,
    requireColleague,
} from "../../utils/colleagues.js";
import User from "../../models/user.mjs";
export async function PATCH(request, { params }) {
    try {
        const user = await getCurrentUser();
        if (!user)
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { id } = await params;
        const settings = await request.json();
        const entity = await colleagueRequest("manage", {
            userId: user.contextId,
            action: "update",
            entityId: id,
            settings: JSON.stringify(settings),
        });
        // Keep legacy personal-assistant callers using the same defaults.
        if (entity.kind === "personal") {
            const changes = {};
            if (settings.name !== undefined) changes.aiName = entity.name;
            if (settings.model !== undefined)
                changes.agentModel = entity.model || "cortex-agent-chat";
            if (settings.reasoningEffort !== undefined)
                changes.reasoningEffort = entity.reasoningEffort;
            if (settings.memoryLearning !== undefined)
                changes.aiMemorySelfModify = entity.memoryLearning;
            if (Object.keys(changes).length) {
                await User.findByIdAndUpdate(user._id, { $set: changes });
                Object.assign(user, changes);
            }
        }
        return Response.json(withEntityDefaults(entity, user));
    } catch (error) {
        return Response.json(
            { error: error.message },
            { status: error.status || 503 },
        );
    }
}

export async function GET(request, { params }) {
    try {
        const user = await getCurrentUser();
        if (!user)
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        return Response.json(
            await requireColleague(user, (await params).id, {
                allowArchived: true,
            }),
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        return Response.json(
            { error: error.message },
            { status: error.status || 503 },
        );
    }
}
