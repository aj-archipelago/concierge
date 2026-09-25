import mongoose from "mongoose";
import { getCurrentUser } from "../utils/auth";
import Task from "../models/task.mjs";
import Chat from "../models/chat.mjs";
import { isShared } from "../utils/colleague-chat.js";
import { describeTeamViews } from "../utils/assistant-team-view.mjs";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const active = ["pending", "in_progress", "waiting"];
export async function GET(request) {
    const reply = (body, status = 200) =>
        Response.json(body, { status, headers });
    try {
        const user = await getCurrentUser();
        if (!user) return reply({ error: "Unauthorized" }, 401);
        const params = new URL(request.url).searchParams;
        const chatId = params.get("chatId");
        const rawCursor = params.get("cursor");
        let cursor = null;
        if (rawCursor) {
            try {
                cursor = JSON.parse(
                    Buffer.from(rawCursor, "base64url").toString(),
                );
                if (
                    !mongoose.isValidObjectId(cursor.id) ||
                    typeof cursor.at !== "string" ||
                    !Number.isFinite(Date.parse(cursor.at))
                )
                    throw new Error();
            } catch {
                return reply({ error: "Invalid team cursor" }, 400);
            }
        }
        const status = params.get("status") || "all";
        const limit = Math.min(
            30,
            Math.max(1, Math.floor(Number(params.get("limit"))) || 20),
        );
        if (
            (chatId && !mongoose.isValidObjectId(chatId)) ||
            !["all", "active", "history"].includes(status)
        )
            return reply({ error: "Invalid team filter" }, 400);
        if (chatId) {
            const chat = await Chat.findOne({ _id: chatId, userId: user._id });
            if (!chat || (await isShared(chat)))
                return reply({ error: "Chat not found" }, 404);
        }
        const filter = { owner: user._id, assistantTeamRevision: { $gt: 0 } };
        if (chatId) filter["invokedFrom.chatId"] = chatId;
        if (cursor)
            filter.$or = [
                { createdAt: { $lt: new Date(cursor.at) } },
                { createdAt: new Date(cursor.at), _id: { $lt: cursor.id } },
            ];
        if (status !== "all")
            filter.status =
                status === "active" ? { $in: active } : { $nin: active };
        const roots = await Task.find(filter)
            .select("+assistantTeam")
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit + 1);
        const page = roots.slice(0, limit);
        return reply({
            teams: await describeTeamViews(user, page),
            nextCursor:
                roots.length > limit
                    ? Buffer.from(
                          JSON.stringify({
                              id: String(page.at(-1)._id),
                              at: new Date(page.at(-1).createdAt).toISOString(),
                          }),
                      ).toString("base64url")
                    : null,
        });
    } catch {
        return reply({ error: "Could not load teams" }, 503);
    }
}
