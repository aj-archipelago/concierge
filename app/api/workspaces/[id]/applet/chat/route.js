import { NextResponse } from "next/server";
import { getClient } from "../../../../../../src/graphql";
import { QUERIES } from "../../../../../../src/graphql";
import LLM from "../../../../models/llm";

export async function POST(request, { params }) {
    try {
        const { messages, model, currentHtml, restEndpoint } =
            await request.json();

        if (!model) {
            return NextResponse.json(
                { error: "Model ID is required" },
                { status: 400 },
            );
        }

        // Get the specified LLM model
        const llm = await LLM.findOne({ _id: model });
        if (!llm) {
            throw new Error("Specified LLM model not found");
        }

        // Get the latest message from the user
        const latestMessage = messages[messages.length - 1];

        // Prepare the conversation history for the AI
        const conversationHistory = messages
            .map((msg) => `${msg.role}: ${msg.content}`)
            .join("\n");

        // Call the AI with the conversation history
        const response = await getClient().query({
            query: QUERIES.WORKSPACE_APPLET_EDIT,
            variables: {
                text: `${conversationHistory}\n${latestMessage.content}`,
                restEndpoint,
                currentHtml,
            },
        });

        // Extract the AI's response
        const aiResponse = response.data.workspace_applet_edit.result;

        let message;
        try {
            // Try to parse as JSON
            const parsed = JSON.parse(aiResponse);
            // Check for expected structure
            if (
                typeof parsed === "object" &&
                parsed !== null &&
                typeof parsed.html === "string" &&
                typeof parsed.changes === "string"
            ) {
                message = {
                    html: parsed.html,
                    changes: parsed.changes,
                };
            } else {
                // Not the expected structure, treat as plain message
                message = aiResponse;
            }
        } catch (e) {
            // Not JSON, treat as plain message
            message = aiResponse;
        }

        // Return the response in the expected format
        return NextResponse.json({
            message,
        });
    } catch (error) {
        console.error(
            "Error in chat endpoint:",
            error.networkError.result.errors,
        );
        return NextResponse.json(
            { error: "Failed to process chat message" },
            { status: 500 },
        );
    }
}
