import WorkspaceMembership from "../../../models/workspace-membership";
import { getCurrentUser } from "../../../utils/auth";

export async function POST(req, { params }) {
    const { id } = params;
    const user = await getCurrentUser();

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
