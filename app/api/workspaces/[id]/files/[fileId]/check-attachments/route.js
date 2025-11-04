import { NextResponse } from "next/server";
import Workspace from "../../../../../models/workspace.js";
import Prompt from "../../../../../models/prompt.js";
import { getCurrentUser } from "../../../../../utils/auth.js";

// GET: check if a file is attached to any prompts in the workspace
export async function GET(request, { params }) {
    const { id: workspaceId, fileId } = params;

    try {
        // Get current user
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        // Find the workspace
        const workspace = await Workspace.findById(workspaceId);
        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 },
            );
        }

        // Check if user is owner
        if (!workspace.owner?.equals(user._id)) {
            return NextResponse.json(
                { error: "Not authorized to view this workspace" },
                { status: 403 },
            );
        }

        // Check if the file is attached to any prompts in the workspace
        const promptsUsingFile = await Prompt.find({
            _id: { $in: workspace.prompts.map((p) => p._id || p) },
            files: fileId,
        }).select("title _id");

        return NextResponse.json({
            isAttached: promptsUsingFile.length > 0,
            attachedPrompts: promptsUsingFile.map((p) => ({
                id: p._id,
                title: p.title,
            })),
        });
    } catch (error) {
        console.error("Error checking file attachments:", error);
        return NextResponse.json(
            { error: "Failed to check file attachments" },
            { status: 500 },
        );
    }
}
