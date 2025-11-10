import { getClient, QUERIES } from "../../../src/graphql";
import LLM from "../models/llm";
import Prompt from "../models/prompt";
import Run from "../models/run";
import Workspace from "../models/workspace";
import { getCurrentUser } from "../utils/auth";
import {
    getLLMWithFallback,
    buildWorkspacePromptVariables,
} from "../utils/llm-file-utils";

export async function POST(req, res) {
    const startedAt = Date.now();
    const requestId = Math.random().toString(36).slice(2, 10);

    const body = await req.json();
    const { text, promptId, systemPrompt, workspaceId, files } = body;

    const user = await getCurrentUser();

    const { getWorkspacePromptQuery } = QUERIES;

    try {
        let responseText;

        const prompt = await Prompt.findById(promptId).populate("files");

        const llmId = prompt.llm;
        const llm = await getLLMWithFallback(LLM, llmId);

        const pathwayName = llm.cortexPathwayName;
        const model = llm.cortexModelName;

        // Fetch workspace to get systemPrompt (workspace context)
        let workspaceSystemPrompt = systemPrompt;
        if (workspaceId) {
            const workspace = await Workspace.findById(workspaceId);
            if (workspace && workspace.systemPrompt) {
                workspaceSystemPrompt = workspace.systemPrompt;
            }
        }

        // Collect all files (client files + prompt files)
        const allFiles = [];
        if (files && files.length > 0) {
            allFiles.push(...files);
        }
        if (prompt.files && prompt.files.length > 0) {
            allFiles.push(...prompt.files);
        }

        // Build variables: systemPrompt (workspace context), prompt (prompt text), text (user input)
        const variables = await buildWorkspacePromptVariables({
            systemPrompt: workspaceSystemPrompt,
            prompt: prompt.text,
            text: text,
            files: allFiles,
        });

        variables.model = model;

        const query = getWorkspacePromptQuery(pathwayName);

        const response = await getClient().query({
            query,
            variables,
        });

        responseText =
            response.data[pathwayName].result || "The response was empty";

        // Extract citations from the tool field if available
        let citations = [];
        if (response.data[pathwayName].tool) {
            try {
                const toolData = JSON.parse(response.data[pathwayName].tool);
                citations = toolData.citations || [];
            } catch (e) {}
        } else {
        }

        const run = await Run.create({
            output: responseText,
            citations,
            owner: user._id,
            workspace: workspaceId,
        });

        return Response.json(run);
    } catch (error) {
        const executionTime = Date.now() - startedAt;
        console.error(`${requestId}: Error occurred:`, {
            error: error.message,
            stack: error.stack,
            executionTimeMs: executionTime,
        });
        return Response.json({ message: error.message }, { status: 500 });
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
