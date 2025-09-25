import Pathway from "../../../models/pathway";
import Prompt from "../../../models/prompt";
import User from "../../../models/user.mjs";
import { deletePathway, putPathway } from "../../../pathways/[id]/db";

// publish workspace to cortex
export async function publishWorkspace(workspace, user, pathwayName, model) {
    const promptIds = workspace.prompts;
    const prompts = await Prompt.find({ _id: { $in: promptIds } });

    // Create a pathway object from the workspace
    const pathwayData = {
        name: pathwayName,
        systemPrompt: workspace.systemPrompt,
        prompts: prompts.map((p) => ({ name: p.title, prompt: p.text })),
        inputParameters: {},
        model: model,
        owner: user._id,
    };

    // Use putPathway to create or update the pathway
    const responsePathway = await putPathway(
        workspace.pathway,
        pathwayData,
        user,
    );

    workspace.pathway = responsePathway._id;
    await workspace.save();

    return responsePathway;
}

// unpublish workspace from cortex
export async function unpublishWorkspace(workspace, user) {
    if (workspace.pathway) {
        await deletePathway(workspace.pathway, user);
    }

    workspace.published = false;
    workspace.pathway = null;
    await workspace.save();
}

// republish an already published workspace to cortex
export async function republishWorkspace(workspace) {
    if (!workspace.pathway) {
        // workspace is not published to cortex
        return;
    }

    const pathway = await Pathway.findById(workspace.pathway);
    if (!pathway) {
        throw new Error("Pathway not found");
    }

    const prompts = await Prompt.find({ _id: { $in: workspace.prompts } });
    const pathwayData = {
        name: pathway.name,
        prompts: prompts.map((p) => ({ name: p.title, prompt: p.text })),
        systemPrompt: workspace.systemPrompt,
        inputParameters: {},
        model: pathway.model,
        owner: pathway.owner,
    };

    const user = await User.findById(pathway.owner);
    const responsePathway = await putPathway(
        workspace.pathway,
        pathwayData,
        user,
    );

    workspace.pathway = responsePathway._id;
    await workspace.save();

    return responsePathway;
}
