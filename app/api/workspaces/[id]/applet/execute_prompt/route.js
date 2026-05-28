import { NextResponse } from "next/server";
import { getClient } from "../../../../../../src/graphql";
import { QUERIES } from "../../../../../../src/graphql";
import Workspace from "../../../../models/workspace";
import { getCurrentUser } from "../../../../utils/auth";
import { buildWorkspacePromptVariables } from "../../../../utils/llm-file-utils";
import { getPromptConfig } from "../../../../utils/prompt-utils";
import config from "../../../../../../config";

export async function POST(request, { params }) {
    params = await params;
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

        const defaultModel = config.cortex.defaultChatModel;
        let promptText = null;
        let pathwayName;
        let model;
        let promptFiles = [];
        let reasoningEffort = null;
        let agentMode = false;

        if (promptId) {
            const promptData = await getPromptConfig(promptId, defaultModel);
            if (!promptData) {
                return NextResponse.json(
                    { error: "Prompt not found" },
                    { status: 404 },
                );
            }

            promptText = promptData.prompt.text;
            // Keep prompt-attached files even if they have a stale validation error.
            // buildWorkspacePromptVariables now has self-healing resolution logic.
            promptFiles = (promptData.prompt.files || []).filter(Boolean);
            pathwayName = promptData.pathwayName;
            model = promptData.model;
            reasoningEffort = promptData.reasoningEffort || null;
            agentMode = promptData.agentMode || false;
        } else {
            // No promptId provided — default to agent mode
            pathwayName = "run_workspace_agent";
            model = config.cortex.AGENTIC_MODEL;
            agentMode = true;
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

        const requestFiles = Array.isArray(files) ? files : [];

        console.info("[workspace execute_prompt] file counts", {
            workspaceId: params.id || null,
            promptId: promptId || null,
            requestFiles: requestFiles.length,
            promptFiles: promptFiles.length,
            totalFiles: promptFiles.length + requestFiles.length,
            agentMode,
            pathwayName,
        });

        // Build variables with explicit prompt-file and request-file routing.
        const variables = await buildWorkspacePromptVariables({
            systemPrompt: workspaceSystemPrompt,
            prompt: promptText,
            text: userInput,
            sharedFiles: promptFiles,
            userFiles: requestFiles,
            chatHistory: chatHistory,
            appletId: workspace?.applet?.toString() || null,
            workspaceId: workspace?._id?.toString() || null,
            workspaceContextKey: workspace?.contextKey || null,
            userContextId: user?.contextId || null,
            userContextKey: user?.contextKey || null,
        });

        variables.model = model;

        // Use agent query for agent pathways, regular query for non-agent
        let query;
        if (agentMode) {
            variables.entityId = user?.personalEntityId || "";
            if (user?.aiName) {
                variables.aiName = user.aiName;
            }
            // Pass reasoningEffort for agent pathways
            if (reasoningEffort) {
                variables.reasoningEffort = reasoningEffort;
            }
            query = QUERIES.getWorkspaceAgentQuery(pathwayName);
        } else {
            // Non-agent pathways still use fileAccessPlan for available file listing.
            delete variables.contextId;
            delete variables.contextKey;
            query = QUERIES.getWorkspacePromptQuery(pathwayName);
        }

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
