import mongoose from "mongoose";
import { getCurrentUser } from "../../utils/auth";
import Task from "../../models/task.mjs";
import { describeTeamViews } from "../../utils/assistant-team-view.mjs";
import { getAssistantConversation } from "../../utils/colleague-chat.js";
export const dynamic = "force-dynamic";
export async function GET(request, { params }) {
    const reply = (body, status = 200) =>
        Response.json(body, {
            status,
            headers: { "Cache-Control": "private, no-store" },
        });
    try {
        const user = await getCurrentUser();
        if (!user) return reply({ error: "Unauthorized" }, 401);
        const { id } = await params;
        if (!mongoose.isValidObjectId(id))
            return reply({ error: "Team not found" }, 404);
        const root = await Task.findOne({
            _id: id,
            owner: user._id,
            assistantTeamRevision: { $gt: 0 },
        }).select("+assistantTeam");
        if (!root?.assistantTeam)
            return reply({ error: "Team not found" }, 404);
        // Opening a background-started team is enough to establish its one
        // conversation, even before it has sent a question or final result.
        try {
            const { chat } = await getAssistantConversation(user, root, {
                create: true,
            });
            root.invokedFrom = {
                ...root.invokedFrom,
                chatId: String(chat._id),
            };
        } catch (error) {
            if (![403, 404].includes(error.status)) throw error;
        }
        const [team] = await describeTeamViews(user, [root], { detail: true });
        return reply({ team });
    } catch {
        return reply({ error: "Could not load team" }, 503);
    }
}
