import { NextResponse } from "next/server";
import AppletData from "../../../models/applet-data";
import { validateMongoDBKey } from "../../../utils/fileValidation";
import { parseJsonRequest } from "../../../utils/parseJsonRequest";
import { getCanvasAppletForDataAccess } from "../utils";
import {
    APPLET_SDK_LIMITS,
    withAppletSdkGuard,
} from "../../../applet/sdk-guard";

// GET: retrieve data for a canvas applet
export async function GET(request, { params }) {
    const { id } = params;

    try {
        const access = await getCanvasAppletForDataAccess(id);
        if (access.error) return access.error;

        const { user } = access;

        return await withAppletSdkGuard({
            appletId: id,
            userId: user._id,
            api: "data.get",
            limits: APPLET_SDK_LIMITS.read,
            run: async () => {
                const appletData = await AppletData.findOne({
                    appletId: id,
                    userId: user._id,
                });

                return NextResponse.json({
                    data: appletData ? appletData.data : {},
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
                const existing = await AppletData.findOne(query);
                const nextData = {
                    ...(existing?.data || {}),
                    [keyValidation.sanitizedKey]: body.value,
                };
                const appletData = await AppletData.findOneAndUpdate(
                    query,
                    {
                        $set: {
                            data: nextData,
                        },
                    },
                    {
                        new: true,
                        upsert: true,
                        runValidators: true,
                    },
                );

                return NextResponse.json({
                    success: true,
                    data: appletData.data,
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
