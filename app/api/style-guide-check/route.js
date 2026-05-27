import { getClient, QUERIES } from "../../../src/graphql";
import Run from "../models/run";
import { getCurrentUser } from "../utils/auth";
import {
    buildFileAccessPlan,
    buildRunContext,
    prepareFileContentForLLM,
} from "../utils/llm-file-utils";
import { createWorkspaceSharedStorageTarget } from "../../../src/utils/storageTargets";
import config from "../../../config";

const STYLE_GUIDE_CONTEXT_ID = "style-guide-check";

export async function POST(req, res) {
    const body = await req.json();
    const { text, llmId, files, agentMode, reasoningEffort } = body;

    const user = await getCurrentUser();

    const { getWorkspacePromptQuery, getWorkspaceAgentQuery } = QUERIES;

    try {
        let responseText;

        // llmId is a cortex model name (e.g. "oai-gpt52"), or use default
        const model = llmId || config.cortex.defaultChatModel;

        const isAgentic = agentMode || false;
        const useReasoningEffort = reasoningEffort || null;

        const pathwayName = isAgentic
            ? "run_workspace_agent"
            : "run_workspace_prompt";

        // Use agent query for agentic mode, regular query for non-agentic
        const query = isAgentic
            ? getWorkspaceAgentQuery(pathwayName)
            : getWorkspacePromptQuery(pathwayName);

        // Create a more detailed system prompt based on whether files are provided
        let systemPrompt = `You are a professional editor and style guide expert. Your task is to review the provided text and make corrections according to best writing practices and style guidelines.`;

        if (files && files.length > 0) {
            systemPrompt += `

IMPORTANT: You have been provided with ${files.length} style guide file(s) that contain specific rules and guidelines. Please carefully review these files first to understand the style requirements, then apply those specific rules when checking the text.

The style guide files may contain:
- Specific grammar and punctuation rules
- Tone and voice guidelines
- Word choice preferences
- Formatting standards
- Writing style requirements
- Industry-specific terminology

Please prioritize the rules from the provided style guide files over general best practices.`;
        }

        systemPrompt += `

Please review the text for:
- Grammar and spelling errors
- Clarity and readability improvements
- Consistency in tone and style
- Proper punctuation and formatting
- Word choice and sentence structure
- Flow and coherence
${files && files.length > 0 ? "- Adherence to the specific style guide rules provided" : ""}

Return the corrected text while maintaining the original meaning and intent. Make minimal changes necessary to improve the quality while preserving the author's voice.

Provide only the corrected text without any titles, explanations or comments about the changes made.`;

        // Build chatHistory with the text to be checked
        const contentArray = [];

        // Add text content to be checked
        if (text && text.trim()) {
            contentArray.push(JSON.stringify({ type: "text", text: text }));
        }

        // Add style guide files if provided
        // Use prepareFileContentForLLM to get files with short-lived URLs
        // Style guide files are always stored in "style-guide-check" context
        const userContextId = user?.contextId || null;
        if (files && files.length > 0) {
            // Style guide files are always in "style-guide-check" context
            const fileContent = await prepareFileContentForLLM(files, {
                storageTarget: createWorkspaceSharedStorageTarget(
                    STYLE_GUIDE_CONTEXT_ID,
                ),
                fetchShortLivedUrls: true,
            });
            contentArray.push(...fileContent);
        }

        // Prepare variables
        const variables = {
            model,
        };

        // Build chatHistory with system message and user content
        const chatHistory = [];

        // Add system prompt
        chatHistory.push({
            role: "system",
            content: [
                JSON.stringify({
                    type: "text",
                    text: systemPrompt,
                }),
            ],
        });

        if (contentArray.length > 0) {
            // Add user message with content
            chatHistory.push({
                role: "user",
                content: contentArray,
            });
        } else if (text && text.trim()) {
            // Fallback to text-only user message
            chatHistory.push({
                role: "user",
                content: [
                    JSON.stringify({
                        type: "text",
                        text: text,
                    }),
                ],
            });
        }

        variables.chatHistory = chatHistory;

        const fileAccessPlan = buildFileAccessPlan({
            workspaceId: STYLE_GUIDE_CONTEXT_ID,
            userContextId,
            userContextKey: user?.contextKey || null,
            workspaceContextKey: null,
        });
        if (fileAccessPlan.length > 0) {
            variables.fileAccessPlan = fileAccessPlan;
        }

        if (isAgentic) {
            const runContext = buildRunContext({
                workspaceId: STYLE_GUIDE_CONTEXT_ID,
                workspaceContextKey: null,
                userContextId,
                userContextKey: user?.contextKey || null,
            });

            variables.contextId = runContext.contextId;
            variables.contextKey = runContext.contextKey;
            variables.entityId = user?.personalEntityId || "";
            if (user?.aiName) {
                variables.aiName = user.aiName;
            }

            // Pass reasoningEffort for agent pathways
            if (useReasoningEffort) {
                variables.reasoningEffort = useReasoningEffort;
            }
        }

        console.log(
            "Style guide check variables",
            JSON.stringify(variables, null, 2),
        );

        const response = await getClient().query({
            query,
            variables,
        });
        responseText = response.data[pathwayName].result;

        // Create a run record for tracking
        const run = await Run.create({
            output: responseText,
            citations: [],
            owner: user._id,
        });

        return Response.json({
            originalText: text,
            correctedText: responseText,
            runId: run._id,
        });
    } catch (error) {
        console.error("Style guide check error:", error);
        return Response.json({ message: error.message }, { status: 500 });
    }
}

export const dynamic = "force-dynamic";
