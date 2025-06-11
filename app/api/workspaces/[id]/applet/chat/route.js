import { NextResponse } from "next/server";
import { getClient } from "../../../../../../src/graphql";
import { QUERIES } from "../../../../../../src/graphql";
import Workspace from "../../../../models/workspace";
import Prompt from "../../../../models/prompt";

export async function POST(request, { params }) {
    try {
        const { messages, currentHtml, promptEndpoint } = await request.json();

        // Get the workspace and its prompts
        const workspace = await Workspace.findById(params.id).populate(
            "prompts",
        );
        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 },
            );
        }

        // Get the latest message from the user
        const latestMessage = messages[messages.length - 1];

        // Prepare the conversation history for the AI
        const conversationHistory = messages
            .map((msg) => `${msg.role}: ${msg.content}`)
            .join("\n");

        const promptDetails = JSON.stringify(
            workspace.prompts.map((prompt) => ({
                title: prompt.title,
                text: prompt.text,
                id: prompt._id,
            })),
        );

        // Call the AI with the conversation history
        const response = await getClient().query({
            query: QUERIES.WORKSPACE_APPLET_EDIT,
            variables: {
                text: `${conversationHistory}\n${latestMessage.content}`,
                promptEndpoint,
                currentHtml,
                promptDetails,
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
