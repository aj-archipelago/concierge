import { getClient, QUERIES } from "../../../src/graphql";
import Run from "../models/run";
import Workspace from "../models/workspace";
import { getCurrentUser } from "../utils/auth";
import { buildWorkspacePromptVariables } from "../utils/llm-file-utils";
import { getPromptWithMigration } from "../utils/prompt-utils";
import { filterValidFiles } from "../utils/file-validation-utils";

export async function POST(req, res) {
    const startedAt = Date.now();
    const requestId = Math.random().toString(36).slice(2, 10);

    const body = await req.json();
    const { text, promptId, systemPrompt, workspaceId, files } = body;

    const user = await getCurrentUser();

    const { getWorkspacePromptQuery } = QUERIES;

    try {
        const promptData = await getPromptWithMigration(promptId);
        if (!promptData) {
            return Response.json(
                { message: "Prompt not found" },
                { status: 404 },
            );
        }

        const { prompt, pathwayName, model } = promptData;

        // Fetch workspace to get systemPrompt (workspace context)
        let workspaceSystemPrompt = systemPrompt;
        let workspace = null;
        if (workspaceId) {
            workspace = await Workspace.findById(workspaceId);
            if (workspace && workspace.systemPrompt) {
                workspaceSystemPrompt = workspace.systemPrompt;
            }
        }

        // Collect all files (client files + prompt files)
        // Filter out errored files
        const allFiles = [];
        if (files && files.length > 0) {
            allFiles.push(...files);
        }
        if (prompt.files && prompt.files.length > 0) {
            const validPromptFiles = await filterValidFiles(prompt.files);
            allFiles.push(...validPromptFiles);
        }

        // Workspace artifacts use workspaceId, user-submitted files use compound contextId (workspace:user)
        const workspaceIdForFiles = workspace?._id?.toString() || null;
        const userContextIdForFiles = user?.contextId || null;

        // Build variables: systemPrompt (workspace context), prompt (prompt text), text (user input)
        // buildWorkspacePromptVariables will compute altContextId for user files in workspaces
        const variables = await buildWorkspacePromptVariables({
            systemPrompt: workspaceSystemPrompt,
            prompt: prompt.text,
            text: text,
            files: allFiles,
            workspaceId: workspaceIdForFiles,
            userContextId: userContextIdForFiles,
            useCompoundContextId: true, // Use compound contextId for user files
        });

        variables.model = model;

        if (workspaceIdForFiles) {
            variables.contextId = workspaceIdForFiles;
        }

        // altContextId is already computed in buildWorkspacePromptVariables if applicable

        const query = getWorkspacePromptQuery(pathwayName);

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
