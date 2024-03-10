import WorkspaceMembership from "../../../models/workspace-membership";
import { getCurrentUser } from "../../../utils/auth";

export async function POST(req, { params }) {
    const { id } = params;
    const user = await getCurrentUser();

    await WorkspaceMembership.findOneAndDelete({
        user: user._id,
        workspace: id,
    });

    return Response.json({ success: true });
}
