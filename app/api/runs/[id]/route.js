import Run from "../../models/run";
import { getCurrentUser } from "../../utils/auth";

export async function DELETE(req, { params }) {
    const id = params.id;
    const currentUser = await getCurrentUser();

    await Run.deleteOne({
        _id: id,
        owner: currentUser._id,
    });

    return Response.json({ success: true });
}
