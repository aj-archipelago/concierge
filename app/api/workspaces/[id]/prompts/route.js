import Prompt from "../../../models/prompt";
import Workspace from "../../../models/workspace";
import { getCurrentUser } from "../../../utils/auth";
import { republishWorkspace } from "../publish/utils";

export async function POST(req, { params }) {
    const { id } = params;
    const user = await getCurrentUser();

    const promptParams = await req.json();

    const prompt = await Prompt.create({
        ...promptParams,
        owner: user._id,
    });

    const workspace = await Workspace.findById(id);
    workspace.prompts.unshift(prompt._id);
    await workspace.save();
    await republishWorkspace(workspace);

    return Response.json(prompt);
}
