import { NextResponse } from "next/server";
import { parseJsonRequest } from "../../../../utils/parseJsonRequest";
import { getCanvasAppletForDataAccess } from "../../utils";
import {
    APPLET_SDK_LIMITS,
    withAppletSdkGuard,
} from "../../../../applet/sdk-guard";
import {
    createSharedData,
    createSharedDataBackup,
    hasMeaningfulContent,
    isPlainSharedDataObject,
    isRevisionMatch,
    loadSharedData,
    replaceSharedData,
    revisionToken,
    validateSharedDataKey,
} from "../../../shared-data-utils";

function sharedDataResponse(doc) {
    return {
        found: Boolean(doc),
        value: doc ? doc.value : null,
        revision: doc ? revisionToken(doc.revision) : null,
        key: doc ? doc.key : null,
    };
}

// GET: retrieve shared data for a canvas applet workspace.
export async function GET(request, { params }) {
    params = await params;
    const { id } = params;

    try {
        const keyValidation = validateSharedDataKey(params.key);
        if (keyValidation.error) return keyValidation.error;

        const access = await getCanvasAppletForDataAccess(id);
        if (access.error) return access.error;

        const { user } = access;

        return await withAppletSdkGuard({
            appletId: id,
            userId: user._id,
            api: "sharedData.get",
            limits: APPLET_SDK_LIMITS.read,
            run: async () => {
                const sharedData = await loadSharedData({
                    appletId: id,
                    key: keyValidation.key,
                });

                return NextResponse.json(sharedDataResponse(sharedData));
            },
        });
    } catch (error) {
        console.error("Error retrieving canvas applet shared data:", error);
        return NextResponse.json(
            { error: error.status ? error.message : "Internal server error" },
            { status: error.status || 500 },
        );
    }
}

// PUT: create or replace shared data with revision protection.
export async function PUT(request, { params }) {
    params = await params;
    const { id } = params;

    try {
        const keyValidation = validateSharedDataKey(params.key);
        if (keyValidation.error) return keyValidation.error;

        const parsedBody = await parseJsonRequest(request);
        if (!parsedBody.ok) return parsedBody.errorResponse;

        const body = parsedBody.body || {};
        if (body.value === undefined) {
            return NextResponse.json(
                { error: "value is required" },
                { status: 400 },
            );
        }
        if (!isPlainSharedDataObject(body.value)) {
            return NextResponse.json(
                { error: "value must be an object" },
                { status: 400 },
            );
        }

        const access = await getCanvasAppletForDataAccess(id);
        if (access.error) return access.error;

        const { user } = access;

        return await withAppletSdkGuard({
            appletId: id,
            userId: user._id,
            api: "sharedData.set",
            limits: APPLET_SDK_LIMITS.dataWrite,
            run: async () => {
                const existing = await loadSharedData({
                    appletId: id,
                    key: keyValidation.key,
                });

                if (!existing) {
                    if (
                        body.expectedRevision !== undefined &&
                        body.expectedRevision !== null
                    ) {
                        return NextResponse.json(
                            {
                                error: "expectedRevision must be null when creating shared data",
                                code: "SHARED_DATA_REVISION_CONFLICT",
                            },
                            { status: 409 },
                        );
                    }

                    const created = await createSharedData({
                        appletId: id,
                        key: keyValidation.key,
                        value: body.value,
                        userId: user._id,
                    });

                    return NextResponse.json({
                        success: true,
                        ...sharedDataResponse(created),
                    });
                }

                if (
                    body.expectedRevision != null &&
                    !isRevisionMatch(body.expectedRevision, existing.revision)
                ) {
                    return NextResponse.json(
                        {
                            error: "Shared data revision conflict",
                            code: "SHARED_DATA_REVISION_CONFLICT",
                            revision: revisionToken(existing.revision),
                        },
                        { status: 409 },
                    );
                }

                const incomingHasContent = hasMeaningfulContent(body.value);
                const existingHasContent = hasMeaningfulContent(existing.value);
                if (
                    existingHasContent &&
                    !incomingHasContent &&
                    body.reset !== true
                ) {
                    return NextResponse.json(
                        {
                            error: "sharedData.set() cannot clear non-empty shared data. Use sharedData.reset() for a user-confirmed clear or reset.",
                            code: "SHARED_DATA_EMPTY_OVERWRITE_BLOCKED",
                            revision: revisionToken(existing.revision),
                        },
                        { status: 409 },
                    );
                }

                await createSharedDataBackup({
                    existing,
                    userId: user._id,
                    reason: body.reset === true ? "reset" : "replace",
                });

                const updated = await replaceSharedData({
                    existing,
                    value: body.value,
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
                    ...sharedDataResponse(updated),
                });
            },
        });
    } catch (error) {
        console.error("Error storing canvas applet shared data:", error);
        return NextResponse.json(
            { error: error.status ? error.message : "Internal server error" },
            { status: error.status || 500 },
        );
    }
}
