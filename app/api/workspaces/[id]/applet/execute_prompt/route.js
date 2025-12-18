import { NextResponse } from "next/server";
import { getClient } from "../../../../../../src/graphql";
import { QUERIES } from "../../../../../../src/graphql";
import LLM from "../../../../models/llm";
import Prompt from "../../../../models/prompt";
import Workspace from "../../../../models/workspace";
import { getCurrentUser } from "../../../../utils/auth";
import {
    getLLMWithFallback,
    getAnyAgenticLLM,
    buildWorkspacePromptVariables,
} from "../../../../utils/llm-file-utils";
import config from "../../../../../../config";

export async function POST(request, { params }) {
    try {
        let { prompt, systemPrompt, promptId, chatHistory, files } =
            await request.json();

        // Get user for contextId
        const user = await getCurrentUser();

        if (!prompt && !promptId && !chatHistory) {
            return NextResponse.json(
                {
                    error: "Either prompt, promptId, or chatHistory is required",
                },
                { status: 400 },
            );
        }

        let promptText = null; // The prompt text from promptDoc
        let llm;
        let promptDoc = null;

        // If promptId is provided, look up the prompt and its associated LLM
        if (promptId) {
            promptDoc = await Prompt.findById(promptId).populate("files");
            if (!promptDoc) {
                return NextResponse.json(
                    { error: "Prompt not found" },
                    { status: 404 },
                );
            }
            promptText = promptDoc.text;
            llm = await getLLMWithFallback(LLM, promptDoc.llm);
        } else {
            // No promptId provided, get default LLM
            llm = await getAnyAgenticLLM(LLM, null);
        }

        // Fetch workspace to get systemPrompt (workspace context)
        let workspaceSystemPrompt = systemPrompt;
        let workspace = null;
        if (params.id) {
            workspace = await Workspace.findById(params.id);
            if (workspace && workspace.systemPrompt) {
                workspaceSystemPrompt = workspace.systemPrompt;
            }
        }

        // Collect all files (prompt files + request files)
        const allFiles = [];
        if (promptDoc && promptDoc.files && promptDoc.files.length > 0) {
            allFiles.push(...promptDoc.files);
        }
        if (files && Array.isArray(files) && files.length > 0) {
            allFiles.push(...files);
        }

        // Workspace artifacts use workspaceId, user-submitted files use user.contextId
        const workspaceIdForFiles = workspace?._id?.toString() || null;
        const userContextIdForFiles = user?.contextId || null;

        // Build variables: systemPrompt (workspace context), prompt (prompt text), text (user input)
        const variables = await buildWorkspacePromptVariables({
            systemPrompt: workspaceSystemPrompt,
            prompt: promptText,
            text: prompt,
            files: allFiles,
            chatHistory: chatHistory,
            workspaceId: workspaceIdForFiles,
            userContextId: userContextIdForFiles,
        });

        if (llm.cortexModelName !== config.cortex?.AGENTIC_MODEL) {
            variables.model = llm.cortexModelName;
        }

        const pathwayName = llm.cortexPathwayName;
        const query = QUERIES.getWorkspacePromptQuery(pathwayName);

        // Call the AI with the prompt
        const response = await getClient().query({
            query,
            variables,
        });

        // Extract the AI's response
        const aiResponse = response.data[pathwayName].result;

        // Extract citations from the tool field if available
        let citations = [];
        if (response.data[pathwayName].tool) {
            try {
                const toolData = JSON.parse(response.data[pathwayName].tool);
                citations = toolData.citations || [];
            } catch (e) {
                console.error("Error parsing tool data:", e);
            }
        }

        // Return the response
        return NextResponse.json({
            output: aiResponse,
            citations,
        });
    } catch (error) {
        console.error("Error in execute endpoint:", error);
        return NextResponse.json(
            { error: "Failed to execute prompt" },
            { status: 500 },
        );
    }
}
