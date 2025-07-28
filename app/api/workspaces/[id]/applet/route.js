import { NextResponse } from "next/server";
import Workspace from "@/app/api/models/workspace";
import Applet from "@/app/api/models/applet";
import { getWorkspace } from "../db.js";
import App, { APP_TYPES, APP_STATUS } from "@/app/api/models/app";
import stringcase from "stringcase";

// GET: fetch or create applet (already implemented)
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

        // Handle App creation/deactivation based on publishedVersionIndex and publishToAppStore preference
        if (body.publishToAppStore !== undefined) {
            if (
                body.publishToAppStore &&
                (body.publishedVersionIndex !== undefined ||
                    body.appName ||
                    body.appSlug)
            ) {
                // Applet is being published to app store - upsert an App
                const appName =
                    body.appName ||
                    body.name ||
                    updatedApplet.name ||
                    `${workspace.name} Applet`;

                // Check if app name conflicts with built-in native apps
                const nativeAppNames = [
                    "Translate",
                    "Video",
                    "Write",
                    "Workspaces",
                    "Images",
                    "Jira",
                ];
                if (nativeAppNames.includes(appName)) {
                    return NextResponse.json(
                        {
                            error: `App name "${appName}" is reserved for built-in apps. Please use another name.`,
                        },
                        { status: 400 },
                    );
                }

                // Use provided slug or existing app slug
                let appSlug = body.appSlug;
                if (!appSlug) {
                    const existingApp = await App.findOne({
                        workspaceId: workspace._id,
                    });
                    appSlug = existingApp?.slug || workspace.slug;
                }

                // Check for slug collision with other apps
                const existingAppWithSlug = await App.findOne({
                    slug: appSlug,
                    workspaceId: { $ne: workspace._id }, // Exclude current workspace's app
                    status: APP_STATUS.ACTIVE,
                });

                if (existingAppWithSlug) {
                    return NextResponse.json(
                        {
                            error: `The slug "${appSlug}" is already in use by another app. Please choose a different slug.`,
                        },
                        { status: 400 },
                    );
                }

                await App.findOneAndUpdate(
                    { workspaceId: workspace._id },
                    {
                        name: appName,
                        slug: appSlug,
                        author: workspace.owner,
                        type: APP_TYPES.APPLET,
                        status: APP_STATUS.ACTIVE,
                        workspaceId: workspace._id,
                        icon: body.appIcon || null,
                    },
                    {
                        new: true,
                        upsert: true,
                        runValidators: true,
                    },
                );
            } else {
                // Applet is being unpublished or not published to app store - deactivate the App
                await App.findOneAndUpdate(
                    { workspaceId: workspace._id },
                    { status: APP_STATUS.INACTIVE },
                    { new: true },
                );
            }
        }

        return NextResponse.json(updatedApplet);
    } catch (error) {
        console.error(error);
        return NextResponse.json(
            { error: "Failed to update applet" },
            { status: 500 },
        );
    }
}
