import Prompt from "../../../models/prompt";
import Workspace from "../../../models/workspace";
import { getCurrentUser } from "../../../utils/auth";
import { republishWorkspace } from "../publish/utils";
import config from "../../../../../config";

export async function POST(req, { params }) {
    const { id } = params;
    const user = await getCurrentUser();

    const promptParams = await req.json();
    console.info("[workspace prompts create] file counts", {
        workspaceId: id,
        title: promptParams?.title || null,
        files: Array.isArray(promptParams?.files)
            ? promptParams.files.length
            : 0,
    });

    const prompt = await Prompt.create({
        ...promptParams,
        owner: user._id,
        llm: promptParams.llm || config.cortex.defaultChatModel,
    });

    const workspace = await Workspace.findById(id);
    workspace.prompts.unshift(prompt._id);
    await workspace.save();
    await republishWorkspace(workspace);

    // Populate the prompt with files before returning
    const populatedPrompt = await Prompt.findById(prompt._id).populate("files");

    return Response.json(populatedPrompt);
}
