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

        // Prepare update object
        const updateObj = {};
        const currentDate = new Date();

        if (body.html !== undefined) {
            updateObj.html = body.html;
            // Use $push with $cond to only add new version if different from last
            updateObj.$push = {
                htmlVersions: {
                    $each: [{
                        content: body.html,
                        timestamp: currentDate
                    }],
                    $cond: {
                        if: {
                            $or: [
                                { $eq: [{ $size: "$htmlVersions" }, 0] },
                                { $ne: [{ $arrayElemAt: ["$htmlVersions.content", -1] }, body.html] }
                            ]
                        }
                    }
                }
            };
        }
        if (body.messages !== undefined) updateObj.messages = body.messages;
        if (body.suggestions !== undefined) updateObj.suggestions = body.suggestions;
        if (body.name !== undefined) updateObj.name = body.name;

        // Use findOneAndUpdate with atomic operations
        const updatedApplet = await Applet.findOneAndUpdate(
            { _id: workspace.applet },
            updateObj,
            { 
                new: true, // Return the updated document
                upsert: true, // Create if doesn't exist
                runValidators: true // Run model validators
            }
        );

        return NextResponse.json(updatedApplet);
    } catch (error) {
        console.error(error);
        return NextResponse.json(
            { error: "Failed to update applet" },
            { status: 500 },
        );
    }
}
