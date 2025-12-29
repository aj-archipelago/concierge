import { NextResponse } from "next/server";
import Workspace from "../../../../models/workspace";
import File from "../../../../models/file";
import { getCurrentUser } from "../../../../utils/auth";
import config from "../../../../../../config";
import { validateAndRefreshFile } from "../../../../utils/file-refresh-utils";

/**
 * Validate and refresh files attached to workspace prompts
 * Checks if files exist in the file handler system, and if not,
 * attempts to re-upload them from their last known URL
 */
export async function POST(request, { params }) {
    const { id: workspaceId } = params;

    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const workspace =
            await Workspace.findById(workspaceId).populate("prompts");
        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 },
            );
        }

        if (!workspace.owner?.equals(user._id)) {
            return NextResponse.json(
                { error: "Not authorized" },
                { status: 403 },
            );
        }

        // Collect all unique files from all prompts
        const fileIds = new Set();
        workspace.prompts.forEach((prompt) => {
            if (prompt.files && Array.isArray(prompt.files)) {
                prompt.files.forEach((fileId) => {
                    fileIds.add(fileId.toString());
                });
            }
        });

        if (fileIds.size === 0) {
            return NextResponse.json({ validated: 0, errors: 0 });
        }

        const files = await File.find({ _id: { $in: Array.from(fileIds) } });
        const mediaHelperUrl = config.endpoints.mediaHelperDirect();
        // Use workspaceId as contextId for workspace artifacts
        const contextId = workspaceId.toString();

        const results = await Promise.allSettled(
            files.map((file) =>
                validateAndRefreshFile(file, contextId, mediaHelperUrl),
            ),
        );

        const validated = results.filter(
            (r) =>
                r.status === "fulfilled" &&
                (r.value.status === "exists" || r.value.status === "refreshed"),
        ).length;
        const errors = results.filter(
            (r) => r.status === "fulfilled" && r.value.status === "error",
        ).length;

        return NextResponse.json({
            validated,
            errors,
            total: files.length,
        });
    } catch (error) {
        console.error("Error validating workspace files:", error);
        return NextResponse.json(
            { error: "Failed to validate files" },
            { status: 500 },
        );
    }
}
