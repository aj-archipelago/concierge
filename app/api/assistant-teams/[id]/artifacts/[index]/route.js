import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { getCurrentUser } from "../../../../utils/auth";
import Task from "../../../../models/task.mjs";
import { colleagueRequest } from "../../../../utils/colleagues.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request, { params }) {
    try {
        const user = await getCurrentUser();
        if (!user)
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { id, index } = await params;
        if (!mongoose.isValidObjectId(id) || !/^\d{1,2}$/.test(index))
            return Response.json(
                { error: "Artifact not found" },
                { status: 404 },
            );
        const root = await Task.findOne({
            _id: id,
            owner: user._id,
            status: "completed",
        }).select("+assistantTeam");
        const artifact =
            root?.assistantTeam?.state === "completed" &&
            root.assistantTeam.result?.artifacts?.[Number(index)];
        if (!artifact)
            return Response.json(
                { error: "Artifact not found" },
                { status: 404 },
            );
        const result = await colleagueRequest("artifact", {
            userId: user.contextId,
            entityId: root.assistantEntityId,
            path: artifact.path,
            sha256: artifact.sha256,
        });
        if (
            typeof result.base64 !== "string" ||
            result.base64.length > 45 * 1024 * 1024
        )
            throw new Error("Invalid artifact response");
        const bytes = Buffer.from(result.base64, "base64");
        if (
            createHash("sha256").update(bytes).digest("hex") !== artifact.sha256
        )
            return Response.json(
                { error: "Artifact changed since review" },
                { status: 409 },
            );
        const filename = artifact.path.split("/").at(-1);
        return new Response(bytes, {
            headers: {
                "Content-Type": "application/octet-stream",
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
                "Content-Length": String(bytes.length),
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "sandbox; default-src 'none'",
            },
        });
    } catch (error) {
        return Response.json(
            { error: error.message },
            { status: error.status || 503 },
        );
    }
}
