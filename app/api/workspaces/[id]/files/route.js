import { NextResponse } from "next/server";
import Workspace from "../../../models/workspace.js";
import AppletSharedFile from "../../../models/applet-shared-file.js";
import File from "../../../models/file.js";
import { getCurrentUser } from "../../../utils/auth.js";
import { ensureAppletSharedFileStore } from "../../../utils/applet-shared-file-utils.js";
import { handleStreamingFileUpload } from "../../../utils/upload-utils.js";
import { deleteMediaFile } from "../../../utils/media-service-utils.js";
import {
    createAppletSharedStorageTarget,
    createWorkspaceSharedStorageTarget,
} from "../../../../../src/utils/storageTargets.js";

function getWorkspaceSharedStorageTarget(workspace) {
    if (!workspace?._id) {
        return null;
    }
    const appletId = workspace?.applet?.toString() || null;
    if (appletId) {
        return createAppletSharedStorageTarget(appletId);
    }
    return createWorkspaceSharedStorageTarget(
        workspace?._id?.toString() || null,
    );
}

async function getSharedFileDocument(workspace, match = null) {
    if (workspace?.applet) {
        return ensureAppletSharedFileStore(workspace, { match });
    }

    const query = Workspace.findById(workspace?._id);
    if (match) {
        query.populate({ path: "files", match });
    } else {
        query.populate("files");
    }
    return query;
}

async function addSharedFileReference(workspace, fileId) {
    if (workspace?.applet) {
        await Workspace.findByIdAndUpdate(workspace._id, {
            $addToSet: {
                files: fileId,
            },
        });

        return AppletSharedFile.findOneAndUpdate(
            { appletId: workspace.applet },
            {
                $addToSet: {
                    files: fileId,
                },
            },
            {
                new: true,
                upsert: true,
                runValidators: true,
            },
        ).populate("files");
    }

    return Workspace.findByIdAndUpdate(
        workspace._id,
        {
            $push: {
                files: fileId,
            },
        },
        {
            new: true,
            runValidators: true,
        },
    ).populate("files");
}

async function deleteDuplicateCloudFile(file, workspace) {
    if ((!file?.blobPath && !file?.hash) || !workspace?._id) {
        return;
    }
    await deleteMediaFile({
        blobPath: file.blobPath,
        hash: file.hash,
        storageTarget: getWorkspaceSharedStorageTarget(workspace),
    });
}

function getFilesFromSharedDocument(sharedDocument) {
    if (!sharedDocument) {
        return [];
    }
    return Array.isArray(sharedDocument.files) ? sharedDocument.files : [];
}

// POST: upload a shared file for a workspace/applet with streaming support
export async function POST(request, { params }) {
    params = await params;
    const { id } = params;
    const workspace = await Workspace.findById(id);

    const result = await handleStreamingFileUpload(request, {
        getWorkspace: async () => workspace,

        checkAuthorization: async (workspace, user) => {
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

        storageTarget: getWorkspaceSharedStorageTarget(workspace),

        associateFile: async (newFile, workspace) => {
            const matchQuery = [];
            if (newFile.blobPath) {
                matchQuery.push({ blobPath: newFile.blobPath });
            }
            if (newFile.hash) {
                matchQuery.push({ hash: newFile.hash });
            }

            if (matchQuery.length > 0) {
                const existingSharedFiles = await getSharedFileDocument(
                    workspace,
                    matchQuery.length === 1
                        ? matchQuery[0]
                        : { $or: matchQuery },
                );

                const existingFiles =
                    getFilesFromSharedDocument(existingSharedFiles);

                if (existingFiles.length > 0) {
                    const existingFile = existingFiles[0];
                    const allFilesDoc = await getSharedFileDocument(workspace);

                    await deleteDuplicateCloudFile(newFile, workspace);
                    await File.findByIdAndDelete(newFile._id);

                    return {
                        success: true,
                        file: existingFile,
                        files: getFilesFromSharedDocument(allFilesDoc),
                    };
                }
            }

            const updatedSharedFiles = await addSharedFileReference(
                workspace,
                newFile._id,
            );

            return {
                success: true,
                file: newFile,
                files: getFilesFromSharedDocument(updatedSharedFiles),
            };
        },

        errorPrefix: "workspace file upload",
    });

    if (result.error) {
        return result.error;
    }

    return NextResponse.json({
        success: true,
        ...result.data,
    });
}

// GET: retrieve shared files for a workspace/applet
export async function GET(request, { params }) {
    params = await params;
    const { id } = params;

    try {
        const workspace = await Workspace.findById(id);
        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 },
            );
        }

        const user = await getCurrentUser();
        if (!workspace.owner?.equals(user._id)) {
            return NextResponse.json(
                { error: "Not authorized to view files for this workspace" },
                { status: 403 },
            );
        }

        const sharedFiles = await getSharedFileDocument(workspace);

        return NextResponse.json({
            files: getFilesFromSharedDocument(sharedFiles),
        });
    } catch (error) {
        console.error("Error retrieving workspace files:", error);
        return NextResponse.json(
            { error: "Failed to retrieve files" },
            { status: 500 },
        );
    }
}
