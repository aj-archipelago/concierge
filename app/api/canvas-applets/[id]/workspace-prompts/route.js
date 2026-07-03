import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../utils/auth";
import { validateAppletAccess } from "../../../applet/access";
import { listWorkspacePromptsForApplet } from "../../../utils/workspace-prompt-execution";

export async function GET(request, { params }) {
    const { id } = await params;

    try {
        const user = await getCurrentUser();
        const accessError = await validateAppletAccess(id, user);
        if (accessError) return accessError;

        const result = await listWorkspacePromptsForApplet(id);
        if (!result) {
            return NextResponse.json(
                {
                    error: "No workspace prompts are available for this applet",
                    prompts: [],
                },
                { status: 404 },
            );
        }

        return NextResponse.json({
            workspaceId: result.workspace._id,
            prompts: result.prompts,
        });
    } catch (error) {
        console.error("Error listing applet workspace prompts:", error);
        return NextResponse.json(
            { error: "Failed to list workspace prompts" },
            { status: 500 },
        );
    }
}
