import Prompt from "../../../models/prompt";
import Workspace from "../../../models/workspace";
import { getCurrentUser } from "../../../utils/auth";
import { createWorkspace } from "../../db";

export async function POST(req, { params }) {
    const { id } = params;
    const user = await getCurrentUser();

    // make a copy of the workspace and all prompts
    const workspace = await Workspace.findById(id);

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

    const newWorkspace = await createWorkspace({
        workspaceName: "Copy of " + workspace.name,
        ownerId: user._id,
        prompts: newPrompts,
        systemPrompt: workspace.systemPrompt,
    });

    return Response.json(newWorkspace);
}
