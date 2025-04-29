import { NextResponse } from "next/server";
import { connectToDatabase } from "@/src/db.mjs";
import Workspace from "@/app/api/models/workspace";
import Applet from "@/app/api/models/applet";

// GET: fetch or create applet (already implemented)
export async function GET(request, { params }) {
    await connectToDatabase();
    const { id } = params;

    try {
        let workspace = await Workspace.findById(id).populate("applet");
        if (!workspace.applet) {
            const newApplet = await Applet.create({
                owner: workspace.owner,
                html: "",
                messages: [],
                suggestions: [],
                name: `${workspace.name} Applet`,
            });
            workspace.applet = newApplet._id;
            await workspace.save();
            workspace = await Workspace.findById(id).populate("applet");
        }
        return NextResponse.json(workspace.applet);
    } catch (error) {
        console.error(error);
        return NextResponse.json(
            { error: "Failed to fetch workspace applet" },
            { status: 500 },
        );
    }
}

// PUT: update applet (html, messages, etc)
export async function PUT(request, { params }) {
    await connectToDatabase();
    const { id } = params;
    const body = await request.json();

    try {
        const workspace = await Workspace.findById(id);
        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 },
            );
        }
        let applet = await Applet.findById(workspace.applet);
        if (!applet) {
            // If no applet, create one
            applet = await Applet.create({
                owner: workspace.owner,
                html: "",
                messages: [],
                suggestions: [],
                name: `${workspace.name} Applet`,
            });
            workspace.applet = applet._id;
            await workspace.save();
        }

        // Only update fields provided in body
        if (body.html !== undefined) applet.html = body.html;
        if (body.messages !== undefined) applet.messages = body.messages;
        if (body.suggestions !== undefined)
            applet.suggestions = body.suggestions;
        if (body.name !== undefined) applet.name = body.name;

        await applet.save();
        return NextResponse.json(applet);
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to update applet" },
            { status: 500 },
        );
    }
}
