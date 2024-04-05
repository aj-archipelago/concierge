import Run from "../../../models/run";
import { getCurrentUser } from "../../../utils/auth";

export async function GET(req, { params }) {
    try {
        const currentUser = await getCurrentUser();
        const outputs = await Run.find({
            workspace: params.id,
            owner: currentUser._id,
        }).sort({ createdAt: -1 });

        return Response.json(outputs);
    } catch (error) {
        console.error(error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    try {
        const currentUser = await getCurrentUser();
        const workspaceId = params.id;

        await Run.deleteMany({
            workspace: workspaceId,
            owner: currentUser._id,
        });

        return Response.json({ success: true });
    } catch (error) {
        console.error(error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
