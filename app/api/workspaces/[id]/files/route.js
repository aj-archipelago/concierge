import { NextResponse } from "next/server";
import Workspace from "../../../models/workspace.js";
import File from "../../../models/file.js";
import { getCurrentUser } from "../../../utils/auth.js";
import { handleStreamingFileUpload } from "../../../utils/upload-utils.js";

// POST: upload a file for a workspace with streaming support
export async function POST(request, { params }) {
    const { id } = params;

    const result = await handleStreamingFileUpload(request, {
        getWorkspace: async () => await Workspace.findById(id),

        checkAuthorization: async (workspace, user) => {
            // Check if user is owner or has permission
            if (!workspace.owner?.equals(user._id)) {
                return {
                    error: NextResponse.json(
                        {
                            error: "Not authorized to upload files to this workspace",
                        },
                        { status: 403 },
                    ),
                };
            }
            return { success: true };
        },

        associateFile: async (newFile, workspace, user) => {
            // Check if a file with the same hash already exists in this workspace
            if (newFile.hash) {
                const existingWorkspace = await Workspace.findById(id).populate(
                    {
                        path: "files",
                        match: { hash: newFile.hash },
                    },
                );

                if (
                    existingWorkspace &&
                    existingWorkspace.files &&
                    existingWorkspace.files.length > 0
                ) {
                    // File with this hash already exists, return existing file without adding
                    const existingFile = existingWorkspace.files[0];
                    const allFiles =
                        await Workspace.findById(id).populate("files");

                    // Delete the duplicate File document we just created
                    await File.findByIdAndDelete(newFile._id);

                    return {
                        success: true,
                        file: existingFile, // Return the existing file, not the duplicate
                        files: allFiles ? allFiles.files : [],
                    };
                }
            }

            // Add file reference to workspace
            const updatedWorkspace = await Workspace.findByIdAndUpdate(
                id,
                {
                    $push: {
                        files: newFile._id,
                    },
                },
                {
                    new: true,
                    runValidators: true,
                },
            ).populate("files");

            return {
                success: true,
                file: newFile,
                files: updatedWorkspace.files,
            };
        },

        errorPrefix: "workspace file upload",
        permanent: true,
    });

    if (result.error) {
        return result.error;
    }

    return NextResponse.json({
        success: true,
        ...result.data,
    });
}

// GET: retrieve files for a workspace
export async function GET(request, { params }) {
    const { id } = params;

    try {
        const workspace = await Workspace.findById(id).populate("files");
        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 },
            );
        }

        // Get current user
        const user = await getCurrentUser();

        // Check if user has access to this workspace
        if (!workspace.owner?.equals(user._id)) {
            return NextResponse.json(
                { error: "Not authorized to view files for this workspace" },
                { status: 403 },
            );
        }

        return NextResponse.json({
            files: workspace.files || [],
        });
    } catch (error) {
        console.error("Error retrieving workspace files:", error);
        return NextResponse.json(
            { error: "Failed to retrieve files" },
            { status: 500 },
        );
    }
}
