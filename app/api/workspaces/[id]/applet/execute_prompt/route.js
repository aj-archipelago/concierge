import { NextResponse } from "next/server";
import { getClient } from "../../../../../../src/graphql";
import { QUERIES } from "../../../../../../src/graphql";
import LLM from "../../../../models/llm";
import Prompt from "../../../../models/prompt";
import {
    prepareFileContentForLLM,
    getLLMWithFallback,
    getAnyAgenticLLM,
} from "../../../../utils/llm-file-utils";

export async function POST(request, { params }) {
    try {
        let { prompt, systemPrompt, promptId, chatHistory, files } =
            await request.json();

        if (!prompt && !promptId && !chatHistory) {
            return NextResponse.json(
                {
                    error: "Either prompt, promptId, or chatHistory is required",
                },
                { status: 400 },
            );
        }

        let promptToSend = prompt;
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
            systemPrompt = promptDoc.text;

            // Get the LLM associated with the prompt
            llm = await getLLMWithFallback(LLM, promptDoc.llm);
        } else {
            // No promptId provided, get default LLM
            llm = await getAnyAgenticLLM(LLM, null);
        }

        const pathwayName = llm.cortexPathwayName;
        const query = QUERIES.getWorkspacePromptQuery(pathwayName);

        // Build chatHistory on server side from individual components
        const variables = {
            systemPrompt,
            model: llm.cortexModelName,
        };

        // Collect all files from different sources
        const allFiles = [];

        // Add files from promptDoc if available
        if (promptDoc && promptDoc.files && promptDoc.files.length > 0) {
            allFiles.push(...promptDoc.files);
        }

        // Add files from request body if provided
        if (files && Array.isArray(files) && files.length > 0) {
            allFiles.push(...files);
        }

        // Check if we need to use chatHistory format (either provided or files present)
        const shouldUseChatHistory = chatHistory || allFiles.length > 0;

        if (shouldUseChatHistory) {
            // Build chatHistory on server side
            let finalChatHistory = [];

            if (
                chatHistory &&
                Array.isArray(chatHistory) &&
                chatHistory.length > 0
            ) {
                // Start with provided chatHistory
                finalChatHistory = [...chatHistory];
            } else {
                // Create new chatHistory with text content
                const contentArray = [];

                if (prompt && prompt.trim()) {
                    contentArray.push(
                        JSON.stringify({ type: "text", text: prompt }),
                    );
                }

                finalChatHistory = [
                    {
                        role: "user",
                        content: contentArray,
                    },
                ];
            }

            // Add files to the last user message in chatHistory
            if (allFiles.length > 0) {
                const fileContent = await prepareFileContentForLLM(allFiles);

                // Find the last user message and add file content to it
                for (let i = finalChatHistory.length - 1; i >= 0; i--) {
                    if (finalChatHistory[i].role === "user") {
                        // Ensure content is an array
                        if (!Array.isArray(finalChatHistory[i].content)) {
                            finalChatHistory[i].content = [
                                JSON.stringify({
                                    type: "text",
                                    text: finalChatHistory[i].content || "",
                                }),
                            ];
                        }

                        // Add file content to the user's content array
                        finalChatHistory[i].content = [
                            ...finalChatHistory[i].content,
                            ...fileContent,
                        ];
                        break;
                    }
                }
            }

            variables.chatHistory = finalChatHistory;
        } else {
            // No files and no chatHistory - use legacy format
            variables.text = promptToSend;
            variables.prompt = promptToSend;
        }

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
