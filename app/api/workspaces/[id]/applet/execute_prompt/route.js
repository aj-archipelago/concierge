import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../utils/auth";
import { executeWorkspacePrompt } from "../../../../utils/workspace-prompt-execution";

export async function POST(request, { params }) {
    params = await params;
    try {
        const user = await getCurrentUser();
        const result = await executeWorkspacePrompt({
            workspaceId: params.id,
            user,
            body: await request.json(),
        });
        return NextResponse.json(result);
    } catch (error) {
        console.error("Error in execute endpoint:", error);
        return NextResponse.json(
            {
                error: error?.status
                    ? error.message
                    : "Failed to execute prompt",
            },
            { status: error?.status || 500 },
        );
    }
}
