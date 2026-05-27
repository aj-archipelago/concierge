import { getClient, QUERIES } from "../../../src/graphql";
import Run from "../models/run";
import Workspace from "../models/workspace";
import { getCurrentUser } from "../utils/auth";
import { buildWorkspacePromptVariables } from "../utils/llm-file-utils";
import { getPromptConfig } from "../utils/prompt-utils";
import config from "../../../config";

export async function POST(req, res) {
    const startedAt = Date.now();
    const requestId = Math.random().toString(36).slice(2, 10);

    const body = await req.json();
    const { text, promptId, systemPrompt, workspaceId, files } = body;

    const user = await getCurrentUser();

    const { getWorkspacePromptQuery, getWorkspaceAgentQuery } = QUERIES;

    try {
        const promptData = await getPromptConfig(
            promptId,
            config.cortex.defaultChatModel,
        );
        if (!promptData) {
            return Response.json(
                { message: "Prompt not found" },
                { status: 404 },
            );
        }

        const { prompt, pathwayName, model, reasoningEffort, agentMode } =
            promptData;

        // Fetch workspace to get systemPrompt (workspace context)
        let workspaceSystemPrompt = systemPrompt;
        let workspace = null;
        if (workspaceId) {
            workspace = await Workspace.findById(workspaceId);
            if (workspace && workspace.systemPrompt) {
                workspaceSystemPrompt = workspace.systemPrompt;
            }
        }

        const promptFiles = Array.isArray(prompt.files)
            ? prompt.files.filter(Boolean)
            : [];
        const requestFiles = Array.isArray(files) ? files : [];

        console.info("[workspace runs] file counts", {
            workspaceId: workspaceId || null,
            promptId: promptId || null,
            requestFiles: requestFiles.length,
            promptFiles: promptFiles.length,
            totalFiles: requestFiles.length + promptFiles.length,
            agentMode,
            pathwayName,
        });

        // Build variables with explicit prompt-file and request-file routing.
        const variables = await buildWorkspacePromptVariables({
            systemPrompt: workspaceSystemPrompt,
            prompt: prompt.text,
            text: text,
            sharedFiles: promptFiles,
            userFiles: requestFiles,
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
            query = getWorkspaceAgentQuery(pathwayName);
        } else {
            // Non-agent pathways still use fileAccessPlan for available file listing.
            delete variables.contextId;
            delete variables.contextKey;
            query = getWorkspacePromptQuery(pathwayName);
        }

        const response = await getClient().query({
            query,
            variables,
        });

        const responseText =
            response.data[pathwayName].result || "The response was empty";

        // Extract citations from the tool field if available
        let citations = [];
        if (response.data[pathwayName].tool) {
            try {
                const toolData = JSON.parse(response.data[pathwayName].tool);
                citations = toolData.citations || [];
            } catch (e) {
                // Ignore parse errors
            }
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

export const dynamic = "force-dynamic";
