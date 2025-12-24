import { NextResponse } from "next/server";
import { getClient } from "../../../../../../src/graphql";
import { QUERIES } from "../../../../../../src/graphql";
import LLM from "../../../../models/llm";
import Workspace from "../../../../models/workspace";
import { getCurrentUser } from "../../../../utils/auth";
import {
    getAnyAgenticLLM,
    buildWorkspacePromptVariables,
} from "../../../../utils/llm-file-utils";
import { getPromptWithMigration } from "../../../../utils/prompt-utils";

export async function POST(request, { params }) {
    try {
        let {
            prompt: userInput,
            systemPrompt,
            promptId,
            chatHistory,
            files,
        } = await request.json();

        const user = await getCurrentUser();

        if (!userInput && !promptId && !chatHistory) {
            return NextResponse.json(
                {
                    error: "Either prompt, promptId, or chatHistory is required",
                },
                { status: 400 },
            );
        }

        let promptText = null;
        let pathwayName;
        let model;
        let promptFiles = [];

        if (promptId) {
            const promptData = await getPromptWithMigration(promptId);
            if (!promptData) {
                return NextResponse.json(
                    { error: "Prompt not found" },
                    { status: 404 },
                );
            }

            promptText = promptData.prompt.text;
            promptFiles = promptData.prompt.files || [];
            pathwayName = promptData.pathwayName;
            model = promptData.model;
        } else {
            // No promptId provided, get default LLM
            const llm = await getAnyAgenticLLM(LLM, null);
            pathwayName = llm.cortexPathwayName;
            model = llm.cortexModelName;
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
        if (promptFiles.length > 0) {
            allFiles.push(...promptFiles);
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
            text: userInput,
            files: allFiles,
            chatHistory: chatHistory,
            workspaceId: workspaceIdForFiles,
            userContextId: userContextIdForFiles,
        });

        variables.model = model;

        if (workspaceIdForFiles) {
            variables.contextId = workspaceIdForFiles;
        }

        const query = QUERIES.getWorkspacePromptQuery(pathwayName);

        const response = await getClient().query({
            query,
            variables,
        });

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
