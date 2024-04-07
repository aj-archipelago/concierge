import WorkspaceState from "../../../models/workspace-state";
import { getCurrentUser } from "../../../utils/auth";

export async function PUT(req, { params }) {
    const body = await req.json();
    const attrs = body;
    const user = await getCurrentUser();
    const workspaceId = params.id;

    try {
        const workspaceState = await WorkspaceState.findOneAndUpdate(
            {
                user: user._id,
                workspace: workspaceId,
            },
            {
                $set: attrs,
            },
            {
                upsert: true,
                new: true,
            },
        );

        return Response.json(workspaceState);
    } catch (error) {
        console.error(error);
        return Response.json({ message: error.message }, { status: 500 });
    }
}

export async function GET(req, { params }) {
    const workspaceId = params.id;
    try {
        const user = await getCurrentUser();
        const workspaceState = await WorkspaceState.findOne({
            user: user._id,
            workspace: workspaceId,
        });

        return Response.json(workspaceState);
    } catch (error) {
        console.error(error);
        return Response.json({ message: error.message }, { status: 500 });
    }
}
