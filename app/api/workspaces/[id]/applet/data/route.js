import { NextResponse } from "next/server";
import AppletData from "../../../../models/applet-data.js";
import AppletUserData from "../../../../models/applet-user-data.js";
import { getWorkspace } from "../../db.js";
import { getCurrentUser } from "@/app/api/utils/auth.js";
import { validateMongoDBKey } from "@/app/api/utils/fileValidation.js";
import { parseJsonRequest } from "@/app/api/utils/parseJsonRequest.js";
import { validateAppletDataPayload } from "@/app/api/utils/appletDataLimits.js";

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

// PUT: store data for an applet
export async function PUT(request, { params }) {
    params = await params;
    const { id } = params;

    try {
        const parsedBody = await parseJsonRequest(request);
        if (!parsedBody.ok) {
            return parsedBody.errorResponse;
        }
        const body = parsedBody.body;

        const workspace = await getWorkspace(id);
        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 },
            );
        }

        // Validate request body
        if (!body.key || body.value === undefined) {
            return NextResponse.json(
                { error: "Key and value are required" },
                { status: 400 },
            );
        }

        // Validate the key to prevent MongoDB injection attacks
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

        // Get current user
        const user = await getCurrentUser();

        // Find or create applet data for this user and applet
        // Use the sanitized key to prevent injection attacks
        const query = {
            appletId: workspace.applet,
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
    } catch (error) {
        console.error("Error storing applet data:", error);
        return NextResponse.json(
            { error: "Failed to store applet data" },
            { status: 500 },
        );
    }
}

// GET: retrieve data for an applet
export async function GET(request, { params }) {
    params = await params;
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

        const query = {
            appletId: workspace.applet,
            userId: user._id,
        };
        const requestUrl = new URL(request.url || "http://localhost");
        const requestedKey = requestUrl.searchParams.get("key");
        if (requestUrl.searchParams.has("key")) {
            const keyValidation = validateMongoDBKey(requestedKey);
            if (!keyValidation.isValid) {
                return NextResponse.json(
                    {
                        error: "Invalid key format",
                        details: keyValidation.errors,
                    },
                    { status: 400 },
                );
            }

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
    } catch (error) {
        console.error("Error retrieving applet data:", error);
        return NextResponse.json(
            { error: "Failed to retrieve applet data" },
            { status: 500 },
        );
    }
}
