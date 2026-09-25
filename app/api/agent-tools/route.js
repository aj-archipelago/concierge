import { connectToDatabase } from "../../../src/db.mjs";
import { createHash } from "node:crypto";
import User from "../models/user.mjs";
import { requireColleague } from "../utils/colleagues.js";
import {
    readAgentToolsToken,
    runAgentToolOnce,
} from "../utils/agent-tool-capabilities.mjs";
import { executeColleagueTool } from "../utils/colleague-agent-tools.js";

export const runtime = "nodejs";
export async function POST(request) {
    try {
        const token = request.headers
            .get("authorization")
            ?.replace(/^Bearer /, "");
        const binding = await readAgentToolsToken(token);
        if (!binding)
            return Response.json(
                { error: "Invalid or expired agent capability" },
                { status: 401 },
            );
        await connectToDatabase();
        const user = await User.findById(binding.userId).lean();
        if (!user || user.contextId !== binding.contextId)
            return Response.json(
                { error: "User is unavailable" },
                { status: 403 },
            );
        const entity = await requireColleague(user, binding.entityId);
        const body = await request.json();
        // The token binds both identities. A tool cannot replace either one.
        if (body.entityId !== entity.id || body.contextId !== user.contextId)
            return Response.json(
                { error: "Agent identity mismatch" },
                { status: 403 },
            );
        return await runAgentToolOnce(token, body.callId, () =>
            executeColleagueTool({
                user,
                entity,
                binding,
                tool: body.tool,
                args: body.args || {},
                operationId: createHash("sha256")
                    .update(`${token}:${body.callId}`)
                    .digest("hex"),
            }),
        );
    } catch (error) {
        return Response.json(
            { error: error.message },
            { status: error.status || 500 },
        );
    }
}
