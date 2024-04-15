import { getClient, QUERIES } from "../../../src/graphql";
import LLM from "../models/llm";
import Prompt from "../models/prompt";
import Run from "../models/run";
import { getCurrentUser } from "../utils/auth";

export async function POST(req, res) {
    const body = await req.json();
    const { text, promptId, systemPrompt, workspaceId } = body;
    const user = await getCurrentUser();
    const { getWorkspacePromptQuery } = QUERIES;

    try {
        let responseText;

        const prompt = await Prompt.findById(promptId);
        const llmId = prompt.llm;

        let llm;
        if (llmId) {
            llm = await LLM.findOne({ _id: llmId });
        } else {
            llm = await LLM.findOne({ isDefault: true });
        }

        const promptToSend = prompt.text;
        const pathwayName = llm.cortexPathwayName;

        const query = getWorkspacePromptQuery(pathwayName);
        const response = await getClient().query({
            query,
            variables: {
                text,
                prompt: promptToSend,
                systemPrompt,
            },
        });
        responseText = response.data[pathwayName].result;

        const run = await Run.create({
            output: responseText,
            owner: user._id,
            workspace: workspaceId,
        });

        return Response.json(run);
    } catch (error) {
        console.error(error);
        return Response.json({ message: error.message }, { status: 500 });
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
