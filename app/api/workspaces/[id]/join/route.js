import Workspace from "../../../models/workspace";
import WorkspaceMembership from "../../../models/workspace-membership";
import { getCurrentUser } from "../../../utils/auth";
import { resolveShareAccess } from "../../../utils/shareAccess";

export async function POST(req, { params }) {
    params = await params;
    const { id } = params;
    const user = await getCurrentUser();
    const workspace = await Workspace.findById(id);

    if (!workspace) {
        return Response.json({ error: "Workspace not found" }, { status: 404 });
    }

    const access = await resolveShareAccess({
        entityType: "workspace",
        entityId: workspace._id,
        userId: user._id,
        ownerId: workspace.owner,
    });

    if (!access.canAccess) {
        return Response.json({ error: "Workspace not found" }, { status: 404 });
    }

    await WorkspaceMembership.findOneAndUpdate(
        {
            user: user._id,
            workspace: id,
        },
        {
            user: user._id,
            workspace: id,
        },
        {
            upsert: true,
        },
    );

    return Response.json({ success: true });
}
