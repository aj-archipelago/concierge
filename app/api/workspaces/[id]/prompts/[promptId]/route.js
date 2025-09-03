import Prompt from "../../../../models/prompt";
import Workspace from "../../../../models/workspace";
import { getCurrentUser } from "../../../../utils/auth";
import { republishWorkspace } from "../../publish/utils";

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
        await republishWorkspace(workspace);

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

export async function PUT(req, { params }) {
    const { id, promptId } = params;
    const attrs = await req.json();
    const user = await getCurrentUser();

    try {
        const workspace = await Workspace.findById(id);
        if (!workspace.owner.equals(user._id)) {
            return Response.json(
                { error: "You are not the owner of this workspace" },
                { status: 403 },
            );
        }

        const prompt = await Prompt.findById(promptId);

        if (!prompt.owner.equals(user._id)) {
            return Response.json(
                { error: "You are not the owner of this prompt" },
                { status: 403 },
            );
        }

        const updatedPrompt = await Prompt.findByIdAndUpdate(promptId, attrs, {
            new: true,
        }).populate("files");

        if (workspace.published) {
            await republishWorkspace(workspace);
        }

        return Response.json(updatedPrompt);
    } catch (e) {
        console.error(e);
        return Response.json({ error: e.message }, { status: 500 });
    }
}
