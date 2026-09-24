import Prompt from "../../../models/prompt";
import Workspace from "../../../models/workspace";
import WorkspaceMembership from "../../../models/workspace-membership";
import Applet from "../../../models/applet";
import { getCurrentUser } from "../../../utils/auth";
import { resolveShareAccess } from "../../../utils/shareAccess";
import { createWorkspace } from "../../db";

async function loadCopyableWorkspace(id, user) {
    const workspace = await Workspace.findById(id);
    if (!workspace) {
        return null;
    }

    const access = await resolveShareAccess({
        entityType: "workspace",
        entityId: workspace._id,
        userId: user?._id,
        ownerId: workspace.owner,
    });
    if (access.canAccess) {
        return workspace;
    }

    const membership = await WorkspaceMembership.exists({
        user: user._id,
        workspace: workspace._id,
    });
    return membership ? workspace : null;
}

export async function POST(req, { params }) {
    params = await params;
    const { id } = params;
    const user = await getCurrentUser();

    // make a copy of the workspace and all prompts
    const workspace = await loadCopyableWorkspace(id, user);
    if (!workspace) {
        return Response.json({ error: "Workspace not found" }, { status: 404 });
    }

    const prompts = await Prompt.find({ _id: { $in: workspace.prompts } });
    const newPrompts = [];
    for (const prompt of prompts) {
        const newPrompt = await Prompt.create({
            title: prompt.title,
            text: prompt.text,
            owner: user._id,
        });
        newPrompts.push(newPrompt._id);
    }

    // Copy applet if it exists
    let newAppletId = null;
    if (workspace.applet) {
        const applet = await Applet.findById(workspace.applet);
        if (applet) {
            const newApplet = await Applet.create({
                owner: user._id,
                html: applet.html,
                htmlVersions: applet.htmlVersions,
                publishedVersionIndex: applet.publishedVersionIndex,
                messages: applet.messages,
                suggestions: applet.suggestions,
                name: applet.name,
            });
            newAppletId = newApplet._id;
        }
    }

    const newWorkspace = await createWorkspace({
        workspaceName: "Copy of " + workspace.name,
        ownerId: user._id,
        prompts: newPrompts,
        systemPrompt: workspace.systemPrompt,
        applet: newAppletId,
    });

    return Response.json(newWorkspace);
}
