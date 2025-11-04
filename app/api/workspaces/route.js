import Workspace from "../models/workspace";
import WorkspaceMembership from "../models/workspace-membership";
import App from "../models/app";
import Pathway from "../models/pathway";
import { getCurrentUser } from "../utils/auth";
import { createWorkspace } from "./db";

export async function POST(req, res) {
    const body = await req.json();
    const currentUser = await getCurrentUser();

    let name = body.name || "New Workspace";
    const workspace = await createWorkspace({
        workspaceName: name,
        ownerId: currentUser._id,
    });

    return Response.json(workspace);
}

export async function GET(req, res) {
    try {
        const currentUser = await getCurrentUser();
        const workspaceMemberships = await WorkspaceMembership.find({
            user: currentUser._id,
        });
        let workspaces = await Workspace.find({
            $or: [
                {
                    owner: currentUser._id,
                },
                {
                    _id: {
                        $in: workspaceMemberships.map(
                            (membership) => membership.workspace,
                        ),
                    },
                },
            ],
        }).sort({ updatedAt: -1 });

        // Fetch app information for each workspace to check if applet is published
        const workspaceIds = workspaces.map((w) => w._id);
        const publishedApps = await App.find({
            workspaceId: { $in: workspaceIds },
            type: "applet",
            status: "active",
        });

        // Fetch pathway information for published workspaces
        const publishedWorkspaceIds = workspaces
            .filter((w) => w.published && w.pathway)
            .map((w) => w.pathway);
        const pathways = await Pathway.find({
            _id: { $in: publishedWorkspaceIds },
        });

        // Create maps for quick lookup
        const appMap = new Map();
        publishedApps.forEach((app) => {
            appMap.set(app.workspaceId.toString(), app);
        });

        const pathwayMap = new Map();
        pathways.forEach((pathway) => {
            pathwayMap.set(pathway._id.toString(), pathway);
        });

        // Add app and pathway information to each workspace
        const workspacesWithApps = workspaces.map((workspace) => {
            const workspaceObj = workspace.toObject();

            // Check for published applet
            const app = appMap.get(workspace._id.toString());
            if (app) {
                workspaceObj.hasPublishedApplet = true;
                workspaceObj.publishedAppletName = app.name;
                workspaceObj.publishedAppletSlug = app.slug;
                workspaceObj.publishedAppletIcon = app.icon;
            } else {
                workspaceObj.hasPublishedApplet = false;
            }

            // Check for published pathway
            if (workspace.published && workspace.pathway) {
                const pathway = pathwayMap.get(workspace.pathway.toString());
                if (pathway) {
                    workspaceObj.hasPublishedPathway = true;
                    workspaceObj.publishedPathwayName = pathway.name;
                } else {
                    workspaceObj.hasPublishedPathway = false;
                }
            } else {
                workspaceObj.hasPublishedPathway = false;
            }

            return workspaceObj;
        });

        return Response.json(workspacesWithApps);
    } catch (error) {
        console.error(error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
