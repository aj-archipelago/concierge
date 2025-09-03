import { getClient, QUERIES } from "../../../src/graphql";
import LLM from "../models/llm";
import Prompt from "../models/prompt";
import Run from "../models/run";
import { getCurrentUser } from "../utils/auth";
import {
    prepareFileContentForLLM,
    getLLMWithFallback,
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

        const promptToSend = prompt.text;
        const pathwayName = llm.cortexPathwayName;
        const model = llm.cortexModelName;

        const query = getWorkspacePromptQuery(pathwayName);

        // Build chatHistory from text, files, prompt, and promptToSend
        const contentArray = [];

        // Add text content if provided
        if (text && text.trim()) {
            contentArray.push(JSON.stringify({ type: "text", text: text }));
        }

        // Add prompt text if provided
        if (promptToSend && promptToSend.trim()) {
            const textContent =
                contentArray.length > 0
                    ? contentArray[0]
                    : JSON.stringify({ type: "text", text: "" });

            // Parse existing text content and append prompt
            const existingContent = JSON.parse(textContent);
            const combinedText = existingContent.text
                ? `${existingContent.text}\n\n${promptToSend}`
                : promptToSend;

            contentArray[0] = JSON.stringify({
                type: "text",
                text: combinedText,
            });
        }

        // Add client-provided files
        if (files && files.length > 0) {
            const clientFileContent = await prepareFileContentForLLM(files);
            contentArray.push(...clientFileContent);
        }

        // Add prompt files
        if (prompt.files && prompt.files.length > 0) {
            const promptFileContent = await prepareFileContentForLLM(
                prompt.files,
            );
            contentArray.push(...promptFileContent);
        }

        // Prepare variables
        const variables = {
            systemPrompt,
        };

        if (contentArray.length > 0) {
            // Use multimodal format
            variables.chatHistory = [
                {
                    role: "user",
                    content: contentArray,
                },
            ];
        } else {
            // Fallback to legacy format (should rarely happen)
            variables.text = text || "";
            variables.prompt = promptToSend || "";
        }

        variables.model = model;

        const response = await getClient().query({
            query,
            variables,
        });

        responseText = response.data[pathwayName].result;

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
