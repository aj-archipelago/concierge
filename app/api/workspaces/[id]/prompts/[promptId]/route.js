import Prompt from "../../../../models/prompt";
import Workspace from "../../../../models/workspace";
import { getCurrentUser } from "../../../../utils/auth";

export async function DELETE(req, { params }) {
    const { id, promptId } = params;
    const user = await getCurrentUser();
    const prompt = await Prompt.findById(promptId);
    if (prompt?.owner && prompt?.owner?.toString() !== user._id.toString()) {
        return Response.json(
            { error: "You do not have permission to delete this prompt" },
            {
                status: 403,
            },
        );
    }
    await Prompt.findByIdAndDelete(promptId);

    try {
        // remove from workspace
        const workspace = await Workspace.findById(id);
        workspace.prompts = workspace.prompts.filter(
            (p) => p?.toString() !== promptId,
        );
        await workspace.save();
        return Response.json({ success: true });
    } catch (e) {
        console.error("e", e);
        return Response.json(
            { error: e.message },
            {
                status: 500,
            },
        );
    }
}
