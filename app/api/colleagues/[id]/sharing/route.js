import { getCurrentUser } from "../../../utils/auth";
import {
    colleagueRequest,
    requireColleague,
} from "../../../utils/colleagues.js";
import User from "../../../models/user.mjs";

async function ownerAccess(params) {
    const user = await getCurrentUser();
    if (!user) throw Object.assign(new Error("Unauthorized"), { status: 401 });
    const { id } = await params;
    const assistant = await requireColleague(user, id);
    if (assistant.kind !== "colleague" || !assistant.isOwner)
        throw Object.assign(new Error("Only the owner can manage sharing"), {
            status: 403,
        });
    return { user, assistant };
}
const failure = (error) =>
    Response.json({ error: error.message }, { status: error.status || 400 });
export async function GET(_request, { params }) {
    try {
        const { assistant } = await ownerAccess(params);
        const entries = assistant.access || [];
        const users = await User.find({
            contextId: { $in: entries.map((e) => e.userId) },
        })
            .select("_id name username contextId")
            .lean();
        return Response.json(
            {
                visibility: assistant.visibility,
                recipients: entries
                    .map((e) => {
                        const u = users.find((u) => u.contextId === e.userId);
                        return u
                            ? {
                                  userId: String(u._id),
                                  name: u.name,
                                  username: u.username,
                                  role: e.role,
                              }
                            : null;
                    })
                    .filter(Boolean),
            },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        return failure(error);
    }
}
export async function PUT(request, { params }) {
    try {
        const { user, assistant } = await ownerAccess(params);
        const { visibility, recipients } = await request.json();
        if (
            !["private", "public"].includes(visibility) ||
            !Array.isArray(recipients) ||
            recipients.length > 100 ||
            recipients.some(
                (e) =>
                    !/^[a-f0-9]{24}$/i.test(e.userId || "") ||
                    !["viewer", "editor"].includes(e.role),
            )
        )
            throw new Error("Invalid sharing settings");
        if (new Set(recipients.map((e) => e.userId)).size !== recipients.length)
            throw new Error("Duplicate recipients");
        const users = await User.find({
            _id: { $in: recipients.map((e) => e.userId) },
        })
            .select("_id contextId")
            .lean();
        if (users.length !== recipients.length)
            throw new Error("A recipient is unavailable");
        await colleagueRequest("manage", {
            userId: user.contextId,
            action: "update",
            entityId: assistant.id,
            settings: JSON.stringify({
                visibility,
                access: recipients.map((e) => ({
                    userId: users.find((u) => String(u._id) === e.userId)
                        .contextId,
                    role: e.role,
                })),
            }),
        });
        return Response.json({ success: true });
    } catch (error) {
        return failure(error);
    }
}
