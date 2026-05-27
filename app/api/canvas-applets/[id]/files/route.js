import { NextResponse } from "next/server";
import AppletFile from "../../../models/applet-file";
import AppletSharedFile from "../../../models/applet-shared-file";
import File from "../../../models/file";
import { handleStreamingFileUpload } from "../../../utils/upload-utils";
import { deleteMediaFile } from "../../../utils/media-service-utils";
import {
    createAppletSharedStorageTarget,
    createAppletUserStorageTarget,
} from "../../../../../src/utils/storageTargets";
import { getCanvasAppletForDataAccess } from "../utils";
import {
    APPLET_SDK_LIMITS,
    withAppletSdkGuard,
} from "../../../applet/sdk-guard";

function getRequestedScope(request) {
    const scope = new URL(request.url).searchParams.get("scope");
    return scope === "shared" ? "shared" : "user";
}

function isAppletOwner(applet, user) {
    return String(applet?.owner) === String(user?._id);
}

function getStorageTarget({ scope, appletId, userContextId }) {
    if (scope === "shared") {
        return createAppletSharedStorageTarget(appletId);
    }
    return createAppletUserStorageTarget(userContextId, appletId);
}

async function getStoreDocument({ scope, appletId, userId, match = null }) {
    const query =
        scope === "shared"
            ? AppletSharedFile.findOne({ appletId })
            : AppletFile.findOne({ appletId, userId });

    if (match) {
        return query.populate({ path: "files", match });
    }

    return query.populate("files");
}

async function appendFileToStore({ scope, appletId, userId, fileId }) {
    if (scope === "shared") {
        return AppletSharedFile.findOneAndUpdate(
            { appletId },
            {
                $push: {
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

    return AppletFile.findOneAndUpdate(
        { appletId, userId },
        {
            $push: {
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

async function removeFileFromStore({ scope, appletId, userId, fileId }) {
    if (scope === "shared") {
        return AppletSharedFile.findOneAndUpdate(
            { appletId },
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

    return AppletFile.findOneAndUpdate(
        { appletId, userId },
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

async function deleteCloudFile(file, { scope, appletId, userContextId }) {
    if ((!file?.blobPath && !file?.hash) || !appletId) {
        return;
    }
    await deleteMediaFile({
        blobPath: file.blobPath,
        hash: file.hash,
        storageTarget: getStorageTarget({
            scope,
            appletId,
            userContextId,
        }),
    });
}

// POST: upload a file for a canvas applet
export async function POST(request, { params }) {
    const { id } = params;
    const scope = getRequestedScope(request);

    const access = await getCanvasAppletForDataAccess(id);
    if (access.error) return access.error;

    const { applet, user } = access;
    if (scope === "shared" && !isAppletOwner(applet, user)) {
        return NextResponse.json(
            { error: "Only the applet owner can manage shared files" },
            { status: 403 },
        );
    }

    return await withAppletSdkGuard({
        appletId: id,
        userId: user._id,
        api: "files.upload",
        limits: APPLET_SDK_LIMITS.fileWrite,
        run: async () => {
            const result = await handleStreamingFileUpload(request, {
                getWorkspace: async () => applet,
                checkAuthorization: null,
                storageTarget: getStorageTarget({
                    scope,
                    appletId: id,
                    userContextId: user.contextId,
                }),
                associateFile: async (newFile, appletObj, uploadUser) => {
                    const matchQuery = [];
                    if (newFile.blobPath) {
                        matchQuery.push({ blobPath: newFile.blobPath });
                    }
                    if (newFile.hash) {
                        matchQuery.push({ hash: newFile.hash });
                    }

                    if (matchQuery.length > 0) {
                        const existingStore = await getStoreDocument({
                            scope,
                            appletId: appletObj._id,
                            userId: uploadUser._id,
                            match:
                                matchQuery.length === 1
                                    ? matchQuery[0]
                                    : { $or: matchQuery },
                        });

                        if (existingStore?.files?.length > 0) {
                            const existingFile = existingStore.files[0];
                            const allFiles = await getStoreDocument({
                                scope,
                                appletId: appletObj._id,
                                userId: uploadUser._id,
                            });

                            await deleteCloudFile(newFile, {
                                scope,
                                appletId: String(appletObj._id),
                                userContextId: uploadUser.contextId,
                            });
                            await File.findByIdAndDelete(newFile._id);

                            return {
                                success: true,
                                file: existingFile,
                                files: allFiles?.files || [],
                            };
                        }
                    }

                    const fileStore = await appendFileToStore({
                        scope,
                        appletId: appletObj._id,
                        userId: uploadUser._id,
                        fileId: newFile._id,
                    });

                    return {
                        success: true,
                        file: newFile,
                        files: fileStore.files,
                    };
                },
                errorPrefix: "canvas applet file upload",
            });

            if (result.error) {
                return result.error;
            }

            return NextResponse.json({
                success: true,
                ...result.data,
            });
        },
    });
}

// GET: retrieve files for a canvas applet
export async function GET(request, { params }) {
    const { id } = params;
    const scope = getRequestedScope(request);

    try {
        const access = await getCanvasAppletForDataAccess(id);
        if (access.error) return access.error;

        const { applet, user } = access;
        if (scope === "shared" && !isAppletOwner(applet, user)) {
            return NextResponse.json(
                { error: "Only the applet owner can view shared files here" },
                { status: 403 },
            );
        }

        return await withAppletSdkGuard({
            appletId: id,
            userId: user._id,
            api: "files.list",
            limits: APPLET_SDK_LIMITS.read,
            run: async () => {
                const fileStore = await getStoreDocument({
                    scope,
                    appletId: id,
                    userId: user._id,
                });
                const files = Array.isArray(fileStore?.files)
                    ? fileStore.files
                    : [];

                return NextResponse.json({
                    files,
                });
            },
        });
    } catch (error) {
        console.error("Error retrieving canvas applet files:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}

// DELETE: delete a specific file from a canvas applet
export async function DELETE(request, { params }) {
    const { id } = params;
    const scope = getRequestedScope(request);
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get("filename");

    try {
        const access = await getCanvasAppletForDataAccess(id);
        if (access.error) return access.error;

        const { applet, user } = access;
        if (scope === "shared" && !isAppletOwner(applet, user)) {
            return NextResponse.json(
                { error: "Only the applet owner can manage shared files" },
                { status: 403 },
            );
        }

        if (!filename) {
            return NextResponse.json(
                { error: "Filename is required" },
                { status: 400 },
            );
        }

        const fileStore = await getStoreDocument({
            scope,
            appletId: id,
            userId: user._id,
        });

        if (!fileStore) {
            return NextResponse.json({
                success: true,
                files: [],
            });
        }

        const files = Array.isArray(fileStore?.files) ? fileStore.files : [];
        const fileToDelete = files.find((file) => file.filename === filename);

        if (!fileToDelete) {
            return NextResponse.json(
                { error: "File not found" },
                { status: 404 },
            );
        }

        return await withAppletSdkGuard({
            appletId: id,
            userId: user._id,
            api: "files.delete",
            limits: APPLET_SDK_LIMITS.fileWrite,
            run: async () => {
                await deleteCloudFile(fileToDelete, {
                    scope,
                    appletId: id,
                    userContextId: user.contextId,
                });
                await File.findByIdAndDelete(fileToDelete._id);

                const updatedStore = await removeFileFromStore({
                    scope,
                    appletId: id,
                    userId: user._id,
                    fileId: fileToDelete._id,
                });

                return NextResponse.json({
                    success: true,
                    files: updatedStore?.files || [],
                });
            },
        });
    } catch (error) {
        console.error("Error deleting canvas applet file:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
