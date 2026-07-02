import { getClient, QUERIES } from "../../../src/graphql";
import Applet from "../models/applet";
import Workspace from "../models/workspace";
import { buildWorkspacePromptVariables } from "./llm-file-utils";
import { getPromptConfig } from "./prompt-utils";
import { parseToolMetadata } from "./tool-metadata";
import config from "../../../config";

function idString(value) {
    return (
        value?._id?.toString?.() || value?.toString?.() || String(value || "")
    );
}

function workspaceHasPrompt(workspace, promptId) {
    if (!promptId || !Array.isArray(workspace?.prompts)) return true;
    const promptIdString = String(promptId);
    return workspace.prompts.some(
        (prompt) => idString(prompt) === promptIdString,
    );
}

export async function getWorkspaceForAppletPrompts(appletId) {
    if (!appletId) return null;
    const workspace = await Workspace.findOne({ applet: appletId });
    if (workspace) return workspace;

    const applet = await Applet.findById(appletId)
        .select("migratedFromWorkspaceId")
        .lean();
    if (!applet?.migratedFromWorkspaceId) return null;
    return Workspace.findById(applet.migratedFromWorkspaceId);
}

export async function listWorkspacePromptsForApplet(appletId) {
    const baseWorkspace = await getWorkspaceForAppletPrompts(appletId);
    const workspace = baseWorkspace
        ? await Workspace.findById(baseWorkspace._id).populate("prompts").lean()
        : null;
    if (!workspace) return null;

    return {
        workspace,
        prompts: (workspace.prompts || []).map((prompt) => ({
            _id: prompt._id,
            title: prompt.title,
            text: prompt.text,
            llm: prompt.llm,
            agentMode: prompt.agentMode || false,
            reasoningEffort: prompt.reasoningEffort || null,
            files: prompt.files || [],
        })),
    };
}

export async function executeWorkspacePrompt({
    workspaceId,
    workspace: providedWorkspace = null,
    user,
    body = {},
}) {
    const {
        prompt: userInput,
        text,
        systemPrompt,
        promptId,
        chatHistory,
        files,
    } = body;
    const inputText = userInput ?? text;

    if (!inputText && !promptId && !chatHistory) {
        const error = new Error(
            "Either prompt, promptId, or chatHistory is required",
        );
        error.status = 400;
        throw error;
    }

    let workspace = providedWorkspace;
    if (!workspace && workspaceId) {
        workspace = await Workspace.findById(workspaceId);
    }

    if (workspaceId && !workspace) {
        const error = new Error("Workspace not found");
        error.status = 404;
        throw error;
    }

    const defaultModel = config.cortex.defaultChatModel;
    let promptText = null;
    let pathwayName;
    let model;
    let promptFiles = [];
    let reasoningEffort = null;
    let agentMode = false;

    if (promptId) {
        if (workspace && !workspaceHasPrompt(workspace, promptId)) {
            const error = new Error("Prompt not found in workspace");
            error.status = 404;
            throw error;
        }

        const promptData = await getPromptConfig(promptId, defaultModel);
        if (!promptData) {
            const error = new Error("Prompt not found");
            error.status = 404;
            throw error;
        }

        promptText = promptData.prompt.text;
        promptFiles = (promptData.prompt.files || []).filter(Boolean);
        pathwayName = promptData.pathwayName;
        model = promptData.model;
        reasoningEffort = promptData.reasoningEffort || null;
        agentMode = promptData.agentMode || false;
    } else {
        pathwayName = "run_workspace_agent";
        model = config.cortex.AGENTIC_MODEL;
        agentMode = true;
    }

    let workspaceSystemPrompt = systemPrompt;
    if (workspace?.systemPrompt) {
        workspaceSystemPrompt = workspace.systemPrompt;
    }

    const requestFiles = Array.isArray(files) ? files : [];

    console.info("[workspace prompt execution] file counts", {
        workspaceId: workspace?._id
            ? idString(workspace._id)
            : workspaceId || null,
        promptId: promptId || null,
        requestFiles: requestFiles.length,
        promptFiles: promptFiles.length,
        totalFiles: promptFiles.length + requestFiles.length,
        agentMode,
        pathwayName,
    });

    const variables = await buildWorkspacePromptVariables({
        systemPrompt: workspaceSystemPrompt,
        prompt: promptText,
        text: inputText,
        sharedFiles: promptFiles,
        userFiles: requestFiles,
        chatHistory,
        appletId: workspace?.applet ? idString(workspace.applet) : null,
        workspaceId: workspace?._id
            ? idString(workspace._id)
            : workspaceId || null,
        workspaceContextKey: workspace?.contextKey || null,
        userContextId: user?.contextId || null,
        userContextKey: user?.contextKey || null,
    });

    variables.model = model;

    let query;
    if (agentMode) {
        variables.entityId = user?.personalEntityId || "";
        if (user?.aiName) {
            variables.aiName = user.aiName;
        }
        if (reasoningEffort) {
            variables.reasoningEffort = reasoningEffort;
        }
        query = QUERIES.getWorkspaceAgentQuery(pathwayName);
    } else {
        delete variables.contextId;
        delete variables.contextKey;
        query = QUERIES.getWorkspacePromptQuery(pathwayName);
    }

    const response = await getClient().query({
        query,
        variables,
    });

    const pathwayResponse = response.data[pathwayName] || {};
    const { citations, metadata } = parseToolMetadata(pathwayResponse.tool);

    return {
        output: pathwayResponse.result || "",
        citations,
        metadata,
    };
}
