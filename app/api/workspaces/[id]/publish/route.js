import Workspace from "../../../models/workspace";
import Prompt from "../../../models/prompt";
import { getCurrentUser } from "../../../utils/auth";
import { publishPrompt, unpublishPrompt } from "../../../prompts/[id]/route";

async function publishWorkspacePrompts(workspace, user) {
    console.log(`Publishing prompts for workspace: ${workspace._id}`);
    const promptIds = workspace.prompts;
    const prompts = await Prompt.find({ _id: { $in: promptIds } });
    
    for (const prompt of prompts) {
        if (!prompt.published) {
            console.log(`Publishing prompt: ${prompt._id}`);
            prompt.published = true;
            await prompt.save();
            await publishPrompt(prompt, user);
        }
    }
    console.log(`Finished publishing prompts for workspace: ${workspace._id}`);
}

async function unpublishWorkspacePrompts(workspace, user) {
    console.log(`Unpublishing prompts for workspace: ${workspace._id}`);
    const promptIds = workspace.prompts;
    const prompts = await Prompt.find({ _id: { $in: promptIds } });
    
    for (const prompt of prompts) {
        console.log(`Unpublishing prompt: ${prompt._id}`);
        prompt.published = false;
        await prompt.save();
        await unpublishPrompt(prompt, user);
    }
    console.log(`Finished unpublishing prompts for workspace: ${workspace._id}`);
}

export async function POST(req, { params }) {
    console.log('POST request received for workspace publish/unpublish');
    const { id } = params;
    const { publish } = await req.json();
    const user = await getCurrentUser();

    console.log(`Workspace ID: ${id}, Publish: ${publish}, User: ${user._id}`);

    try {
        const workspace = await Workspace.findOne({
            _id: id,
            owner: user._id,
        });

        if (!workspace) {
            console.log(`Workspace not found: ${id}`);
            return Response.json({ error: "Workspace not found" }, { status: 404 });
        }

        console.log(`Updating workspace published status to: ${publish}`);
        workspace.published = publish;
        await workspace.save();

        if (publish) {
            console.log('Publishing workspace prompts');
            await publishWorkspacePrompts(workspace, user);
        } else {
            console.log('Unpublishing workspace prompts');
            await unpublishWorkspacePrompts(workspace, user);
        }

        console.log('Workspace publish/unpublish operation completed successfully');
        return Response.json(workspace);
    } catch (error) {
        console.error('Error in workspace publish/unpublish:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
