import { NextResponse } from "next/server";
import { getCurrentUser } from "../utils/auth";
import { createAppletRegistry, listAppletRegistry } from "./registry";

function jsonError(error, fallback = "Internal server error") {
    return NextResponse.json(
        {
            error: error?.message || fallback,
            ...(error?.details || {}),
        },
        { status: error?.status || 500 },
    );
}

export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user?._id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        return NextResponse.json(await listAppletRegistry(user));
    } catch (error) {
        console.error("Error fetching canvas applets:", error);
        return jsonError(error);
    }
}

export async function POST(request) {
    try {
        const user = await getCurrentUser();
        if (!user?._id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        const applet = await createAppletRegistry(user, await request.json());
        return NextResponse.json(applet, { status: 201 });
    } catch (error) {
        console.error("Error creating canvas applet:", error);
        return jsonError(error);
    }
}
