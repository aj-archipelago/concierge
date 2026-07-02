import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../utils/auth";
import { validateAppletAccess } from "../../../../../applet/access";
import {
    executeWorkspacePrompt,
    getWorkspaceForAppletPrompts,
} from "../../../../../utils/workspace-prompt-execution";

export async function POST(request, { params }) {
    const { id, promptId } = await params;

    try {
        const user = await getCurrentUser();
        const accessError = await validateAppletAccess(id, user);
        if (accessError) return accessError;

        const workspace = await getWorkspaceForAppletPrompts(id);
        if (!workspace) {
            return NextResponse.json(
                {
                    error: "No workspace prompts are available for this applet",
                },
                { status: 404 },
            );
        }

        const body = await request.json();
        const result = await executeWorkspacePrompt({
            workspace,
            user,
            body: {
                ...body,
                promptId,
            },
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error("Error running applet workspace prompt:", error);
        return NextResponse.json(
            {
                error: error?.status
                    ? error.message
                    : "Failed to run workspace prompt",
            },
            { status: error?.status || 500 },
        );
    }
}
