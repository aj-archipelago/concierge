import { NextResponse } from "next/server";
import AppletSharedDataRevision from "../../../../../models/applet-shared-data-revision";
import { parseJsonRequest } from "../../../../../utils/parseJsonRequest";
import { getCanvasAppletForDataAccess } from "../../../utils";
import {
    APPLET_SDK_LIMITS,
    withAppletSdkGuard,
} from "../../../../../applet/sdk-guard";
import {
    createSharedDataBackup,
    loadSharedData,
    replaceSharedData,
    revisionToken,
    validateSharedDataKey,
} from "../../../../shared-data-utils";

function findBackupQuery({ appletId, key, body }) {
    const query = { appletId, key };
    if (body.backupId) {
        query._id = body.backupId;
    } else if (body.revision != null) {
        query.revision = Number(body.revision);
    }
    return query;
}

// POST: restore a shared data recovery snapshot.
export async function POST(request, { params }) {
    params = await params;
    const { id } = params;

    try {
        const keyValidation = validateSharedDataKey(params.key);
        if (keyValidation.error) return keyValidation.error;

        const parsedBody = await parseJsonRequest(request);
        if (!parsedBody.ok) return parsedBody.errorResponse;

        const body = parsedBody.body || {};
        if (!body.backupId && body.revision == null) {
            return NextResponse.json(
                { error: "backupId or revision is required" },
                { status: 400 },
            );
        }

        const access = await getCanvasAppletForDataAccess(id);
        if (access.error) return access.error;

        const { user } = access;

        return await withAppletSdkGuard({
            appletId: id,
            userId: user._id,
            api: "sharedData.restore",
            limits: APPLET_SDK_LIMITS.dataWrite,
            run: async () => {
                const [existing, backup] = await Promise.all([
                    loadSharedData({
                        appletId: id,
                        key: keyValidation.key,
                    }),
                    AppletSharedDataRevision.findOne(
                        findBackupQuery({
                            appletId: id,
                            key: keyValidation.key,
                            body,
                        }),
                    ),
                ]);

                if (!existing) {
                    return NextResponse.json(
                        {
                            error: "Shared data is missing",
                            code: "SHARED_DATA_MISSING",
                        },
                        { status: 404 },
                    );
                }

                if (!backup) {
                    return NextResponse.json(
                        {
                            error: "Shared data backup not found",
                            code: "SHARED_DATA_BACKUP_NOT_FOUND",
                        },
                        { status: 404 },
                    );
                }

                await createSharedDataBackup({
                    existing,
                    userId: user._id,
                    reason: "restore",
                });

                const updated = await replaceSharedData({
                    existing,
                    value: backup.value,
                    userId: user._id,
                });

                if (!updated) {
                    return NextResponse.json(
                        {
                            error: "Shared data revision conflict",
                            code: "SHARED_DATA_REVISION_CONFLICT",
                            revision: revisionToken(existing.revision),
                        },
                        { status: 409 },
                    );
                }

                return NextResponse.json({
                    success: true,
                    found: true,
                    key: keyValidation.key,
                    value: updated.value,
                    revision: revisionToken(updated.revision),
                    restoredFromRevision: revisionToken(backup.revision),
                });
            },
        });
    } catch (error) {
        console.error("Error restoring canvas applet shared data:", error);
        return NextResponse.json(
            { error: error.status ? error.message : "Internal server error" },
            { status: error.status || 500 },
        );
    }
}
