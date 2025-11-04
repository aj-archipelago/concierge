import { NextResponse } from "next/server";
import Workspace from "../../../../models/workspace.js";
import File from "../../../../models/file.js";
import Prompt from "../../../../models/prompt.js";
import { getCurrentUser } from "../../../../utils/auth.js";
import config from "../../../../../../config/index.js";

// DELETE: delete a specific file from a workspace by file ID
export async function DELETE(request, { params }) {
    const { id: workspaceId, fileId } = params;
    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "true";

    try {
        // Get current user
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        // Find the workspace and populate files
        const workspace =
            await Workspace.findById(workspaceId).populate("files");
        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 },
            );
        }

        // Check if user is owner
        if (!workspace.owner?.equals(user._id)) {
            return NextResponse.json(
                { error: "Not authorized to delete files from this workspace" },
                { status: 403 },
            );
        }

        // Find the file to delete by ID
        const fileToDelete = await File.findById(fileId);

        // Verify the file belongs to this workspace
        const fileInWorkspace = workspace.files.some(
            (file) => file._id.toString() === fileId,
        );

        if (!fileToDelete) {
            // File not found in database - still need to clean up workspace references
            if (fileInWorkspace) {
                // Remove the file reference from the workspace
                const updatedWorkspace = await Workspace.findByIdAndUpdate(
                    workspaceId,
                    {
                        $pull: {
                            files: fileId,
                        },
                    },
                    {
                        new: true,
                        runValidators: true,
                    },
                ).populate("files");

                return NextResponse.json({
                    success: true,
                    message:
                        "File already deleted, removed reference from workspace",
                    files: updatedWorkspace.files || [],
                });
            } else {
                // File not in database and not in workspace
                return NextResponse.json({
                    success: true,
                    message: "File already deleted or does not exist",
                    files: workspace.files || [],
                });
            }
        }

        if (!fileInWorkspace) {
            // File exists in database but not in this workspace
            return NextResponse.json({
                success: true,
                message: "File not found in this workspace",
                files: workspace.files || [],
            });
        }

        // Check if the file is attached to any prompts in the workspace
        const promptsUsingFile = await Prompt.find({
            _id: { $in: workspace.prompts },
            files: fileId,
        }).select("title _id");

        if (promptsUsingFile.length > 0) {
            if (force) {
                // Force deletion: detach file from all prompts first
                await Prompt.updateMany(
                    { _id: { $in: promptsUsingFile.map((p) => p._id) } },
                    { $pull: { files: fileId } },
                );
            } else {
                // Normal deletion: return error if attached
                return NextResponse.json(
                    {
                        error: "File is currently attached to one or more prompts",
                        promptsUsingFile: promptsUsingFile.map((p) => ({
                            id: p._id,
                            title: p.title,
                        })),
                        code: "FILE_ATTACHED_TO_PROMPTS",
                    },
                    { status: 409 }, // Conflict status code
                );
            }
        }

        // Delete the file from the container using the file handler
        try {
            const containerName = process.env.CORTEX_MEDIA_PERMANENT_STORE_NAME;
            if (containerName && fileToDelete.hash) {
                const mediaHelperUrl = config.endpoints.mediaHelperDirect();
                if (!mediaHelperUrl) {
                    console.error(
                        "CORTEX_MEDIA_API_URL is not set or mediaHelperUrl is undefined.",
                    );
                    return NextResponse.json(
                        {
                            error: "Media helper URL is not configured. Please set CORTEX_MEDIA_API_URL.",
                        },
                        { status: 500 },
                    );
                }

                const deleteResponse = await fetch(mediaHelperUrl, {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        params: {
                            hash: fileToDelete.hash,
                            container: containerName,
                        },
                    }),
                });

                if (!deleteResponse.ok) {
                    const errorBody = await deleteResponse.text();
                    console.warn(
                        `Failed to delete file from container: ${deleteResponse.statusText}. Response: ${errorBody}`,
                    );
                    // Continue with database deletion even if container deletion fails
                } else {
                    console.log(
                        `Successfully deleted file ${fileToDelete.hash} from container ${containerName}`,
                    );
                }
            }
        } catch (error) {
            console.error("Error deleting file from container:", error);
            // Continue with database deletion even if container deletion fails
        }

        // Remove the file document
        await File.findByIdAndDelete(fileId);

        // Remove the file reference from the workspace
        const updatedWorkspace = await Workspace.findByIdAndUpdate(
            workspaceId,
            {
                $pull: {
                    files: fileId,
                },
            },
            {
                new: true,
                runValidators: true,
            },
        ).populate("files");

        return NextResponse.json({
            success: true,
            files: updatedWorkspace.files || [],
        });
    } catch (error) {
        console.error("Error deleting workspace file:", error);
        return NextResponse.json(
            { error: "Failed to delete file" },
            { status: 500 },
        );
    }
}
