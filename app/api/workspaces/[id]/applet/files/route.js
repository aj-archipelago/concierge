import { NextResponse } from "next/server";
import AppletFile from "../../../../models/applet-file.js";
import File from "../../../../models/file.js";
import { getWorkspace } from "../../db.js";
import { getCurrentUser } from "../../../../utils/auth.js";
import { handleStreamingFileUpload } from "../../../../utils/upload-utils.js";
import { deleteMediaFile } from "../../../../utils/media-service-utils.js";
import { createAppletUserStorageTarget } from "../../../../../../src/utils/storageTargets.js";

async function deleteCloudFile(file, userContextId, appletId) {
    if ((!file?.blobPath && !file?.hash) || !userContextId || !appletId) {
        return;
    }
    await deleteMediaFile({
        blobPath: file.blobPath,
        hash: file.hash,
        storageTarget: createAppletUserStorageTarget(userContextId, appletId),
    });
}

// POST: upload a file for an applet with streaming support
export async function POST(request, { params }) {
    const { id } = params;
    const workspace = await getWorkspace(id);
    const user = await getCurrentUser();

    const result = await handleStreamingFileUpload(request, {
        getWorkspace: async () => workspace,

        // No authorization check needed for applet files
        checkAuthorization: null,

        storageTarget: workspace?.applet
            ? createAppletUserStorageTarget(
                  user?.contextId || null,
                  workspace.applet?.toString() || null,
              )
            : null,

        associateFile: async (newFile, workspace, user) => {
            const appletId = workspace?.applet?.toString() || null;
            // Check if a file with the same blobPath or hash already exists for this user/applet
            const matchQuery = [];
            if (newFile.blobPath)
                matchQuery.push({ blobPath: newFile.blobPath });
            if (newFile.hash) matchQuery.push({ hash: newFile.hash });
            if (matchQuery.length > 0) {
                const existingAppletFile = await AppletFile.findOne({
                    appletId,
                    userId: user._id,
                }).populate({
                    path: "files",
                    match:
                        matchQuery.length === 1
                            ? matchQuery[0]
                            : { $or: matchQuery },
                });

                if (existingAppletFile && existingAppletFile.files.length > 0) {
                    // File with this hash already exists, return existing file and files without adding
                    const existingFile = existingAppletFile.files[0];
                    const allFiles = await AppletFile.findOne({
                        appletId,
                        userId: user._id,
                    }).populate("files");

                    await deleteCloudFile(newFile, user.contextId, appletId);
                    // Delete the duplicate File document we just created
                    await File.findByIdAndDelete(newFile._id);

                    return {
                        success: true,
                        file: existingFile, // Return the existing file, not the duplicate
                        files: allFiles ? allFiles.files : [],
                    };
                }
            }

            // Find or create applet file record for this user and applet
            const appletFile = await AppletFile.findOneAndUpdate(
                {
                    appletId,
                    userId: user._id,
                },
                {
                    $push: {
                        files: newFile._id,
                    },
                },
                {
                    new: true,
                    upsert: true,
                    runValidators: true,
                },
            ).populate("files");

            return { success: true, file: newFile, files: appletFile.files };
        },

        errorPrefix: "applet file upload",
    });

    if (result.error) {
        return result.error;
    }

    return NextResponse.json({
        success: true,
        ...result.data,
    });
}

// GET: retrieve files for an applet
export async function GET(request, { params }) {
    const { id } = params;

    try {
        const workspace = await getWorkspace(id);
        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 },
            );
        }

        // Get current user
        const user = await getCurrentUser();

        // Find applet files for this user and applet
        const appletFile = await AppletFile.findOne({
            appletId: workspace.applet,
            userId: user._id,
        }).populate("files");

        return NextResponse.json({
            files: appletFile ? appletFile.files : [],
        });
    } catch (error) {
        console.error("Error retrieving applet files:", error);
        return NextResponse.json(
            { error: "Failed to retrieve files" },
            { status: 500 },
        );
    }
}

// DELETE: delete a specific file from an applet
export async function DELETE(request, { params }) {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get("filename");

    try {
        const workspace = await getWorkspace(id);
        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 },
            );
        }

        if (!filename) {
            return NextResponse.json(
                { error: "Filename is required" },
                { status: 400 },
            );
        }

        // Get current user
        const user = await getCurrentUser();

        // First, find the applet file to get the file reference
        const appletFile = await AppletFile.findOne({
            appletId: workspace.applet,
            userId: user._id,
        }).populate("files");

        if (!appletFile) {
            return NextResponse.json({
                success: true,
                files: [],
            });
        }

        // Find the file to delete by filename
        const fileToDelete = appletFile.files.find(
            (file) => file.filename === filename,
        );

        if (!fileToDelete) {
            return NextResponse.json(
                { error: "File not found" },
                { status: 404 },
            );
        }

        await deleteCloudFile(
            fileToDelete,
            user.contextId,
            workspace?.applet?.toString() || null,
        );
        // Remove the file document
        await File.findByIdAndDelete(fileToDelete._id);

        // Remove the file reference from the applet files
        const updatedAppletFile = await AppletFile.findOneAndUpdate(
            {
                appletId: workspace.applet,
                userId: user._id,
            },
            {
                $pull: {
                    files: fileToDelete._id,
                },
            },
            {
                new: true,
                runValidators: true,
            },
        ).populate("files");

        return NextResponse.json({
            success: true,
            files: updatedAppletFile ? updatedAppletFile.files : [],
        });
    } catch (error) {
        console.error("Error deleting applet file:", error);
        return NextResponse.json(
            { error: "Failed to delete file" },
            { status: 500 },
        );
    }
}
