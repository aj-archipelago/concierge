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

// GET: retrieve data for a canvas applet
export async function GET(request, { params }) {
    params = await params;
    const { id } = params;

    try {
        const access = await getCanvasAppletForDataAccess(id);
        if (access.error) return access.error;

        const { user } = access;

        const requestUrl = new URL(request.url || "http://localhost");
        const requestedKey = requestUrl.searchParams.get("key");
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
                    const [legacyDoc, keyedDoc] = await Promise.all([
                        AppletData.findOne(query),
                        AppletUserData.findOne({
                            ...query,
                            key: keyValidation.sanitizedKey,
                        }),
                    ]);
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

                const [legacyDoc, keyedDocs] = await Promise.all([
                    AppletData.findOne(query),
                    AppletUserData.find(query),
                ]);

                return NextResponse.json({
                    data: mergeAppletData({ legacyDoc, keyedDocs }),
                });
            },
        });
    } catch (error) {
        console.error("Error retrieving canvas applet data:", error);
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

    try {
        const parsedBody = await parseJsonRequest(request);
        if (!parsedBody.ok) {
            return parsedBody.errorResponse;
        }
        const body = parsedBody.body;

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

                await AppletUserData.findOneAndUpdate(
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
                );
                const [legacyDoc, keyedDocs] = await Promise.all([
                    AppletData.findOne(query),
                    AppletUserData.find(query),
                ]);

                return NextResponse.json({
                    success: true,
                    data: mergeAppletData({ legacyDoc, keyedDocs }),
                });
            },
        });
    } catch (error) {
        console.error("Error storing canvas applet data:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
