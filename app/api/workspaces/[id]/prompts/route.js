import LLM from "../../../models/llm";
import Prompt from "../../../models/prompt";
import Workspace from "../../../models/workspace";
import { getCurrentUser } from "../../../utils/auth";
import { republishWorkspace } from "../publish/utils";

export async function POST(req, { params }) {
    const { id } = params;
    const user = await getCurrentUser();

    const promptParams = await req.json();
    const defaultLLM = await LLM.findOne({ isDefault: true });

    const prompt = await Prompt.create({
        ...promptParams,
        owner: user._id,
        llm: promptParams.llm || defaultLLM._id,
    });

    const workspace = await Workspace.findById(id);
    workspace.prompts.unshift(prompt._id);
    await workspace.save();
    await republishWorkspace(workspace);

    // Populate the prompt with files before returning
    const populatedPrompt = await Prompt.findById(prompt._id).populate("files");

    return Response.json(populatedPrompt);
}
