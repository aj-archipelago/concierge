import { NextResponse } from "next/server";
import { connectToDatabase } from "@/src/db.mjs";
import Workspace from "@/app/api/models/workspace";
import Applet from "@/app/api/models/applet";
import { getWorkspace } from "../db.js";

// GET: fetch or create applet (already implemented)
export async function GET(request, { params }) {
    await connectToDatabase();
    const { id } = params;

    try {
        const workspace = await getWorkspace(id);
        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 },
            );
        }

        // Find the workspace document to access the applet reference
        const workspaceDoc = await Workspace.findById(workspace._id).populate(
            "applet",
        );

        if (!workspaceDoc.applet) {
            const newApplet = await Applet.create({
                owner: workspaceDoc.owner,
                html: "",
                messages: [],
                suggestions: [],
                name: `${workspaceDoc.name} Applet`,
            });
            workspaceDoc.applet = newApplet._id;
            await workspaceDoc.save();
            await workspaceDoc.populate("applet");
        }
        return NextResponse.json(workspaceDoc.applet);
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
        const workspace = await getWorkspace(id);
        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 },
            );
        }

        // Find the workspace document to access the applet reference
        const workspaceDoc = await Workspace.findById(workspace._id);
        if (!workspaceDoc.applet) {
            return NextResponse.json(
                { error: "Applet not found" },
                { status: 404 },
            );
        }

        // Prepare update object
        const updateObj = {};
        const currentDate = new Date();

        if (body.htmlVersions !== undefined) {
            // Direct update of htmlVersions array when provided
            updateObj.htmlVersions = body.htmlVersions.map((content) => ({
                content,
                timestamp: currentDate,
            }));
        } else if (body.html !== undefined) {
            // Existing logic for adding new versions
            updateObj.html = body.html;
            updateObj.$push = {
                htmlVersions: {
                    $each: [
                        {
                            content: body.html,
                            timestamp: currentDate,
                        },
                    ],
                    $cond: {
                        if: {
                            $or: [
                                { $eq: [{ $size: "$htmlVersions" }, 0] },
                                {
                                    $ne: [
                                        {
                                            $arrayElemAt: [
                                                "$htmlVersions.content",
                                                -1,
                                            ],
                                        },
                                        body.html,
                                    ],
                                },
                            ],
                        },
                    },
                },
            };
        }
        if (body.messages !== undefined) updateObj.messages = body.messages;
        if (body.suggestions !== undefined)
            updateObj.suggestions = body.suggestions;
        if (body.name !== undefined) updateObj.name = body.name;
        if (body.publishedVersionIndex !== undefined)
            updateObj.publishedVersionIndex = body.publishedVersionIndex;

        // Use findOneAndUpdate with atomic operations
        const updatedApplet = await Applet.findOneAndUpdate(
            { _id: workspaceDoc.applet },
            updateObj,
            {
                new: true,
                upsert: true,
                runValidators: true,
            },
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
