import { NextResponse } from "next/server";
import AppletData from "../../../../models/applet-data.js";
import { getWorkspace } from "../../db.js";
import { getCurrentUser } from "@/app/api/utils/auth.js";
import { validateMongoDBKey } from "@/app/api/utils/fileValidation.js";
import { parseJsonRequest } from "@/app/api/utils/parseJsonRequest.js";

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

        // Find applet data for this user and applet
        const appletData = await AppletData.findOne({
            appletId: workspace.applet,
            userId: user._id,
        });

        return NextResponse.json({
            data: appletData ? appletData.data : {},
        });
    } catch (error) {
        console.error("Error retrieving applet data:", error);
        return NextResponse.json(
            { error: "Failed to retrieve applet data" },
            { status: 500 },
        );
    }
}
