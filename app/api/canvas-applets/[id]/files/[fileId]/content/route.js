import { NextResponse } from "next/server";
import AppletFile from "../../../../../models/applet-file";
import AppletSharedFile from "../../../../../models/applet-shared-file";
import File from "../../../../../models/file";
import {
    createAppletSharedStorageTarget,
    createAppletUserStorageTarget,
} from "../../../../../../../src/utils/storageTargets";
import { resolveAndHealFile } from "../../../../../utils/file-resolution-utils";
import { getCanvasAppletForDataAccess } from "../../../utils";
import {
    APPLET_SDK_LIMITS,
    withAppletSdkGuard,
} from "../../../../../applet/sdk-guard";

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

async function getStoreDocument({ scope, appletId, userId }) {
    const query =
        scope === "shared"
            ? AppletSharedFile.findOne({ appletId })
            : AppletFile.findOne({ appletId, userId });
    return query.populate("files");
}

// GET: stream file content for a canvas applet (proxies storage to avoid CORS)
export async function GET(request, { params }) {
    const { id: appletId, fileId } = params;
    const scope = getRequestedScope(request);

    try {
        const access = await getCanvasAppletForDataAccess(appletId);
        if (access.error) return access.error;

        const { applet, user } = access;
        if (scope === "shared" && !isAppletOwner(applet, user)) {
            return NextResponse.json(
                { error: "Only the applet owner can view shared files here" },
                { status: 403 },
            );
        }

        return await withAppletSdkGuard({
            appletId,
            userId: user._id,
            api: "files.content",
            limits: APPLET_SDK_LIMITS.read,
            run: async () => {
                const fileStore = await getStoreDocument({
                    scope,
                    appletId,
                    userId: user._id,
                });

                if (!fileStore) {
                    return NextResponse.json(
                        { error: "File not found" },
                        { status: 404 },
                    );
                }

                const file = fileStore.files.find(
                    (f) => f._id.toString() === fileId,
                );
                if (!file) {
                    return NextResponse.json(
                        { error: "File not found" },
                        { status: 404 },
                    );
                }

                const storageTarget = getStorageTarget({
                    scope,
                    appletId,
                    userContextId: user.contextId,
                });
                const resolved = await resolveAndHealFile(file, {
                    storageTarget,
                    allowUrlRefresh: true,
                    persistResolvedFile: async (updateFields) => {
                        await File.findByIdAndUpdate(file._id, updateFields);
                    },
                });

                if (!resolved.accessUrl) {
                    return NextResponse.json(
                        { error: "Failed to resolve file from storage" },
                        { status: 404 },
                    );
                }

                const azureResponse = await fetch(resolved.accessUrl, {
                    redirect: "follow",
                });

                if (!azureResponse.ok) {
                    console.error(
                        `Failed to fetch file from storage: ${azureResponse.status} ${azureResponse.statusText}`,
                    );
                    return NextResponse.json(
                        { error: "Failed to fetch file from storage" },
                        { status: azureResponse.status },
                    );
                }

                const contentType =
                    azureResponse.headers.get("content-type") ||
                    file.mimeType ||
                    "application/octet-stream";

                const contentLength =
                    azureResponse.headers.get("content-length");

                return new NextResponse(azureResponse.body, {
                    status: 200,
                    headers: {
                        "Content-Type": contentType,
                        ...(contentLength && {
                            "Content-Length": contentLength,
                        }),
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET",
                        "Access-Control-Expose-Headers":
                            "Content-Type, Content-Length, Content-Disposition",
                        "Cache-Control": "public, max-age=3600",
                        "Content-Disposition": `inline; filename="${file.originalName || file.filename}"`,
                    },
                });
            },
        });
    } catch (error) {
        console.error("Error streaming canvas applet file content:", error);
        return NextResponse.json(
            { error: "Failed to stream file" },
            { status: 500 },
        );
    }
}
