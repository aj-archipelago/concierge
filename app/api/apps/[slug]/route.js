import { NextResponse } from "next/server";
import App, { APP_STATUS } from "../../models/app";
import Workspace from "../../models/workspace";
import Applet from "../../models/applet";

export async function GET(request, { params }) {
    const { slug } = params;

    try {
        // Find the app by slug
        const app = await App.findOne({
            slug: slug,
            status: APP_STATUS.ACTIVE,
        }).populate("author", "username email");

        if (!app) {
            return NextResponse.json(
                { error: "App not found" },
                { status: 404 },
            );
        }

        // If it's an applet, we need to get the workspace and applet data
        if (app.type === "applet" && app.workspaceId) {
            const workspace = await Workspace.findById(
                app.workspaceId,
            ).populate("applet");

            if (!workspace || !workspace.applet) {
                return NextResponse.json(
                    { error: "Associated workspace or applet not found" },
                    { status: 404 },
                );
            }

            const applet = await Applet.findById(workspace.applet._id);

            if (!applet) {
                return NextResponse.json(
                    { error: "Applet not found" },
                    { status: 404 },
                );
            }

            return NextResponse.json({
                app,
                workspace,
                applet,
            });
        }

        // For other app types, just return the app
        return NextResponse.json({ app });
    } catch (error) {
        console.error("Error fetching app by slug:", error);
        return NextResponse.json(
            { error: "Failed to fetch app" },
            { status: 500 },
        );
    }
}
