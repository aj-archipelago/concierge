import Workspace from "../models/workspace";
import WorkspaceMembership from "../models/workspace-membership";
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

        return Response.json(workspaces);
    } catch (error) {
        console.error(error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
