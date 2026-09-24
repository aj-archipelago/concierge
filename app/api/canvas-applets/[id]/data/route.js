import { NextResponse } from "next/server";
import AppletData from "../../../models/applet-data";
import AppletUserData from "../../../models/applet-user-data";
import { validateMongoDBKey } from "../../../utils/fileValidation";
import { parseJsonRequest } from "../../../utils/parseJsonRequest";
import { validateAppletDataPayload } from "../../../utils/appletDataLimits";
import { getCanvasAppletForDataAccess } from "../utils";
import {
    APPLET_SDK_LIMITS,
    withAppletSdkGuard,
} from "../../../applet/sdk-guard";
import {
    formatDbErrorForLog,
    getCosmosRetryAfterMs,
    isCosmosRateLimitError,
    withCosmosRetry,
} from "../../../utils/db-retry.mjs";

function toPlainData(doc) {
    return doc?.data && typeof doc.data === "object" ? doc.data : {};
}

function mergeAppletData({ legacyDoc, keyedDocs }) {
    return {
        ...toPlainData(legacyDoc),
        ...Object.fromEntries(
            (keyedDocs || []).map((doc) => [doc.key, doc.value]),
        ),
    };
}

function cosmosRateLimitResponse(error, { message, code }) {
    const retryAfterMs = getCosmosRetryAfterMs(error) ?? 1000;
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    const response = NextResponse.json(
        {
            error: message,
            code,
            retryAfterMs,
        },
        { status: 429 },
    );
    if (response.headers && typeof response.headers.set === "function") {
        response.headers.set("Retry-After", String(retryAfterSeconds));
    }
    return response;
}

// GET: retrieve data for a canvas applet
export async function GET(request, { params }) {
    params = await params;
    const { id } = params;
    let requestedKey = null;

    try {
        const access = await getCanvasAppletForDataAccess(id);
        if (access.error) return access.error;

        const { user } = access;

        const requestUrl = new URL(request.url || "http://localhost");
        requestedKey = requestUrl.searchParams.get("key");
        let keyValidation = null;
        if (requestUrl.searchParams.has("key")) {
            keyValidation = validateMongoDBKey(requestedKey);
            if (!keyValidation.isValid) {
                return NextResponse.json(
                    {
                        error: "Invalid key format",
                        details: keyValidation.errors,
                    },
                    { status: 400 },
                );
            }
        }

        return await withAppletSdkGuard({
            appletId: id,
            userId: user._id,
            api: "data.get",
            limits: APPLET_SDK_LIMITS.read,
            run: async () => {
                const query = {
                    appletId: id,
                    userId: user._id,
                };

                if (keyValidation) {
                    const [legacyDoc, keyedDoc] = await withCosmosRetry(
                        () =>
                            Promise.all([
                                AppletData.findOne(query),
                                AppletUserData.findOne({
                                    ...query,
                                    key: keyValidation.sanitizedKey,
                                }),
                            ]),
                        {
                            label: `canvas applet data.get key appletId=${id} key=${keyValidation.sanitizedKey}`,
                        },
                    );
                    const legacyData = toPlainData(legacyDoc);
                    const found =
                        Boolean(keyedDoc) ||
                        Object.prototype.hasOwnProperty.call(
                            legacyData,
                            keyValidation.sanitizedKey,
                        );
                    const value = keyedDoc
                        ? keyedDoc.value
                        : legacyData[keyValidation.sanitizedKey];

                    return NextResponse.json({
                        found,
                        key: keyValidation.sanitizedKey,
                        value: found ? value : undefined,
                    });
                }

                const [legacyDoc, keyedDocs] = await withCosmosRetry(
                    () =>
                        Promise.all([
                            AppletData.findOne(query),
                            AppletUserData.find(query),
                        ]),
                    {
                        label: `canvas applet data.get all appletId=${id}`,
                    },
                );

                return NextResponse.json({
                    data: mergeAppletData({ legacyDoc, keyedDocs }),
                });
            },
        });
    } catch (error) {
        console.error(
            "Error retrieving canvas applet data: appletId=%s key=%s: %s",
            id,
            requestedKey ?? "all",
            formatDbErrorForLog(error),
            error,
        );
        if (isCosmosRateLimitError(error)) {
            return cosmosRateLimitResponse(error, {
                message:
                    "Applet data retrieval is temporarily rate limited. Retry shortly.",
                code: "APPLET_DATA_RATE_LIMITED",
            });
        }
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}

// PUT: store data for a canvas applet
export async function PUT(request, { params }) {
    params = await params;
    const { id } = params;
    let requestKey = null;

    try {
        const parsedBody = await parseJsonRequest(request);
        if (!parsedBody.ok) {
            return parsedBody.errorResponse;
        }
        const body = parsedBody.body;
        requestKey = body?.key ?? null;

        if (!body.key || body.value === undefined) {
            return NextResponse.json(
                { error: "Key and value are required" },
                { status: 400 },
            );
        }

        const keyValidation = validateMongoDBKey(body.key);
        if (!keyValidation.isValid) {
            return NextResponse.json(
                {
                    error: "Invalid key format",
                    details: keyValidation.errors,
                },
                { status: 400 },
            );
        }

        const access = await getCanvasAppletForDataAccess(id);
        if (access.error) return access.error;

        const { user } = access;

        return await withAppletSdkGuard({
            appletId: id,
            userId: user._id,
            api: "data.set",
            limits: APPLET_SDK_LIMITS.dataWrite,
            run: async () => {
                const query = {
                    appletId: id,
                    userId: user._id,
                };
                const sizeValidation = validateAppletDataPayload({
                    key: keyValidation.sanitizedKey,
                    value: body.value,
                });
                if (!sizeValidation.ok) {
                    return sizeValidation.response;
                }

                await withCosmosRetry(
                    () =>
                        AppletUserData.findOneAndUpdate(
                            {
                                ...query,
                                key: keyValidation.sanitizedKey,
                            },
                            {
                                $set: {
                                    value: body.value,
                                    valueBytes: sizeValidation.valueBytes,
                                },
                            },
                            {
                                new: true,
                                upsert: true,
                                runValidators: true,
                            },
                        ),
                    {
                        label: `canvas applet data.set write appletId=${id} key=${keyValidation.sanitizedKey}`,
                    },
                );
                const [legacyDoc, keyedDocs] = await withCosmosRetry(
                    () =>
                        Promise.all([
                            AppletData.findOne(query),
                            AppletUserData.find(query),
                        ]),
                    {
                        label: `canvas applet data.set reload appletId=${id} key=${keyValidation.sanitizedKey}`,
                    },
                );

                return NextResponse.json({
                    success: true,
                    data: mergeAppletData({ legacyDoc, keyedDocs }),
                });
            },
        });
    } catch (error) {
        console.error(
            "Error storing canvas applet data: appletId=%s key=%s: %s",
            id,
            requestKey ?? "unknown",
            formatDbErrorForLog(error),
            error,
        );
        if (isCosmosRateLimitError(error)) {
            return cosmosRateLimitResponse(error, {
                message:
                    "Applet data storage is temporarily rate limited. Retry shortly.",
                code: "APPLET_DATA_RATE_LIMITED",
            });
        }
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
