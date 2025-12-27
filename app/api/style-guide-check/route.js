import { getClient, QUERIES } from "../../../src/graphql";
import LLM from "../models/llm";
import Run from "../models/run";
import Workspace from "../models/workspace";
import { getCurrentUser } from "../utils/auth";
import {
    buildAgentContext,
    prepareFileContentForLLM,
} from "../utils/llm-file-utils";

export async function POST(req, res) {
    const body = await req.json();
    const { text, llmId, workspaceId, files } = body;

    const user = await getCurrentUser();

    const { getWorkspacePromptQuery, getWorkspaceAgentQuery } = QUERIES;

    try {
        let responseText;

        let llm;
        if (llmId) {
            llm = await LLM.findOne({ _id: llmId });
        }

        // If no LLM is found, use the default LLM
        if (!llm) {
            llm = await LLM.findOne({ isDefault: true });
        }

        const pathwayName = llm.cortexPathwayName;
        const model = llm.cortexModelName;
        const isAgentic = llm.isAgentic || false;

        // Use agent query for agentic LLMs, regular query for non-agentic
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
        // Style guide files are workspace artifacts (use workspaceId)
        // User files (if any) use compound contextId for workspace-specific privacy
        const userContextId = user?.contextId || null;
        if (files && files.length > 0) {
            // Pass "system" as workspaceId when workspaceId is null so artifacts use "system" contextId
            const fileContent = await prepareFileContentForLLM(
                files,
                workspaceId || "system", // workspaceId for workspace files, "system" for system style guides
                userContextId,
                true, // Fetch short-lived URLs
                !!workspaceId, // Use compound contextId for user files when in workspace context
            );
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

        // Only include agentContext for agentic LLMs
        if (isAgentic) {
            // Fetch workspace to get contextKey if workspaceId is provided
            let workspace = null;
            if (workspaceId) {
                workspace = await Workspace.findById(workspaceId);
            }

            // Build agentContext for Cortex API
            // For style guide: workspace context is default, with optional user context for user files
            const agentContext = buildAgentContext({
                workspaceId: workspaceId || "system",
                workspaceContextKey: workspace?.contextKey || null,
                userContextId,
                userContextKey: user?.contextKey || null,
                includeCompoundContext: !!workspaceId, // Only include compound context when in workspace
            });

            if (agentContext.length > 0) {
                variables.agentContext = agentContext;
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
        const runData = {
            output: responseText,
            citations: [],
            owner: user._id,
        };

        // Only add workspace if provided
        if (workspaceId) {
            runData.workspace = workspaceId;
        }

        const run = await Run.create(runData);

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
