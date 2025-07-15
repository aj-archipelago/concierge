import { NextResponse } from "next/server";
import { getWorkspace } from "../db.js";
import App from "@/app/api/models/app";

// GET: fetch existing app for workspace
export async function GET(request, { params }) {
    const { id } = params;

    try {
        const workspace = await getWorkspace(id);
        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 },
            );
        }

        // Find the existing app for this workspace
        const existingApp = await App.findOne({
            workspaceId: workspace._id,
            type: "applet",
        });

        return NextResponse.json(existingApp);
    } catch (error) {
        console.error(error);
        return NextResponse.json(
            { error: "Failed to fetch workspace app" },
            { status: 500 },
        );
    }
}
