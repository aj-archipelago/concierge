import { NextResponse } from "next/server";
import Workspace from "../../../../models/workspace.js";
import AppletSharedFile from "../../../../models/applet-shared-file.js";
import File from "../../../../models/file.js";
import Prompt from "../../../../models/prompt.js";
import { getCurrentUser } from "../../../../utils/auth.js";
import { ensureAppletSharedFileStore } from "../../../../utils/applet-shared-file-utils.js";
import { deleteMediaFile } from "../../../../utils/media-service-utils.js";
import {
    createAppletSharedStorageTarget,
    createWorkspaceSharedStorageTarget,
} from "../../../../../../src/utils/storageTargets.js";

function getSharedStorageTarget(workspace) {
    const appletId = workspace?.applet?.toString() || null;
    if (appletId) {
        return createAppletSharedStorageTarget(appletId);
    }
    return createWorkspaceSharedStorageTarget(
        workspace?._id?.toString() || null,
    );
}

async function getSharedFilesDoc(workspace) {
    if (workspace?.applet) {
        return ensureAppletSharedFileStore(workspace);
    }
    return Workspace.findById(workspace._id).populate("files");
}

async function removeSharedFileReference(workspaceId, workspace, fileId) {
    if (workspace?.applet) {
        await Workspace.findByIdAndUpdate(workspaceId, {
            $pull: {
                files: fileId,
            },
        });

        return AppletSharedFile.findOneAndUpdate(
            { appletId: workspace.applet },
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
    }

    return Workspace.findByIdAndUpdate(
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
}

// DELETE: delete a specific shared file from a workspace/applet by file ID
export async function DELETE(request, { params }) {
    const { id: workspaceId, fileId } = params;
    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "true";

    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const workspace = await Workspace.findById(workspaceId);
        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 },
            );
        }

        if (!workspace.owner?.equals(user._id)) {
            return NextResponse.json(
                { error: "Not authorized to delete files from this workspace" },
                { status: 403 },
            );
        }

        const sharedFilesDoc = await getSharedFilesDoc(workspace);
        const sharedFiles = Array.isArray(sharedFilesDoc?.files)
            ? sharedFilesDoc.files
            : [];

        const fileInWorkspace = sharedFiles.some(
            (file) => file._id.toString() === fileId,
        );
        const fileToDelete = await File.findById(fileId);

        if (!fileToDelete) {
            if (fileInWorkspace) {
                const updatedSharedFiles = await removeSharedFileReference(
                    workspaceId,
                    workspace,
                    fileId,
                );

                return NextResponse.json({
                    success: true,
                    message:
                        "File already deleted, removed reference from workspace",
                    files: updatedSharedFiles?.files || [],
                });
            }

            return NextResponse.json({
                success: true,
                message: "File already deleted or does not exist",
                files: sharedFiles,
            });
        }

        if (!fileInWorkspace) {
            return NextResponse.json({
                success: true,
                message: "File not found in this workspace",
                files: sharedFiles,
            });
        }

        const promptsUsingFile = await Prompt.find({
            _id: { $in: workspace.prompts },
            files: fileId,
        }).select("title _id");

        if (promptsUsingFile.length > 0) {
            if (force) {
                await Prompt.updateMany(
                    { _id: { $in: promptsUsingFile.map((p) => p._id) } },
                    { $pull: { files: fileId } },
                );
            } else {
                return NextResponse.json(
                    {
                        error: "File is currently attached to one or more prompts",
                        promptsUsingFile: promptsUsingFile.map((p) => ({
                            id: p._id,
                            title: p.title,
                        })),
                        code: "FILE_ATTACHED_TO_PROMPTS",
                    },
                    { status: 409 },
                );
            }
        }

        if (fileToDelete.hash || fileToDelete.blobPath) {
            await deleteMediaFile({
                blobPath: fileToDelete.blobPath,
                hash: fileToDelete.hash,
                storageTarget: getSharedStorageTarget(workspace),
            });
        }

        await File.findByIdAndDelete(fileId);

        const updatedSharedFiles = await removeSharedFileReference(
            workspaceId,
            workspace,
            fileId,
        );

        return NextResponse.json({
            success: true,
            files: updatedSharedFiles?.files || [],
        });
    } catch (error) {
        console.error("Error deleting workspace file:", error);
        return NextResponse.json(
            { error: "Failed to delete file" },
            { status: 500 },
        );
    }
}
