import mongoose from "mongoose";
import { getCurrentUser } from "../../../utils/auth";
import Chat from "../../../models/chat.mjs";
import Notification from "../../../models/notification.mjs";
import { isShared } from "../../../utils/colleague-chat.js";

export const dynamic = "force-dynamic";

// Lightweight arrival signal for a visible chat. No presence records, model
// calls, task transitions, or read receipts are produced by this GET.
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
            return reply({ error: "Chat not found" }, 404);
        const chat = await Chat.findOne({
            _id: id,
            userId: user._id,
            isPublic: false,
        });
        if (!chat || (await isShared(chat)))
            return reply({ error: "Private chat not found" }, 404);
        const notices = await Notification.find({
            owner: user._id,
            type: "colleague-message",
            read: { $ne: true },
            dismissed: { $ne: true },
            "metadata.chatId": String(chat._id),
            "metadata.messageId": { $exists: true },
        })
            .select("metadata.messageId metadata.kind")
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        return reply({
            deliveries: notices.map((n) => ({
                id: String(n._id),
                messageId: n.metadata.messageId,
                kind: n.metadata.kind,
            })),
        });
    } catch {
        return reply({ error: "Could not load chat deliveries" }, 503);
    }
}
