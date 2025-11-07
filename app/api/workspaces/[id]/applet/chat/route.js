import { NextResponse } from "next/server";
import { getClient, QUERIES } from "../../../../../../src/graphql";
import Workspace from "../../../../models/workspace";
import { getWorkspace } from "../../db.js";

export async function POST(request, { params }) {
    try {
        const {
            messages,
            currentHtml,
            promptEndpoint,
            dataEndpoint,
            fileEndpoint,
            stream,
        } = await request.json();

        // Get the workspace and its prompts using getWorkspace
        const workspace = await getWorkspace(params.id);
        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 },
            );
        }

        // Find the workspace document to access the prompts
        const workspaceDoc = await Workspace.findById(workspace._id).populate(
            "prompts",
        );
        if (!workspaceDoc) {
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
            workspaceDoc.prompts.map((prompt) => ({
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
                dataEndpoint,
                currentHtml,
                promptDetails,
                fileEndpoint,
                stream,
            },
        });

        // Extract the AI's response
        const aiResponse = response.data.workspace_applet_edit.result;

        // If stream is true, return the result as-is without parsing
        if (stream) {
            return NextResponse.json({
                message: aiResponse,
            });
        }

        // Check if response contains an APPLET tag
        const appletTagRegex = /<APPLET>([\s\S]*?)<\/APPLET>/i;
        const appletMatch = aiResponse.match(appletTagRegex);

        let message;
        if (appletMatch && appletMatch[1]) {
            // Extract HTML from APPLET tag
            let htmlContent = appletMatch[1].trim();

            // If the content inside APPLET tags contains markdown code blocks, extract the inner content
            const codeBlockRegex = /```(?:html)?\s*([\s\S]*?)```/g;
            const codeBlockMatches = [...htmlContent.matchAll(codeBlockRegex)];

            if (codeBlockMatches.length > 0) {
                // Use the last (most complete) code block content
                htmlContent =
                    codeBlockMatches[codeBlockMatches.length - 1][1].trim();
            }

            if (htmlContent) {
                message = {
                    html: htmlContent,
                    changes: "HTML code generated from APPLET tag",
                };
            } else {
                // Empty APPLET tag, treat as plain message
                message = aiResponse;
            }
        } else {
            // Fallback: Check for code blocks (for backward compatibility)
            const codeBlockRegex = /```(?:html)?\s*([\s\S]*?)```/g;
            let match;
            let lastMatch = null;

            // Find all code blocks and use the last one (most complete)
            while ((match = codeBlockRegex.exec(aiResponse)) !== null) {
                lastMatch = match;
            }

            if (lastMatch) {
                // Extract HTML from code block
                const htmlContent = lastMatch[1].trim();
                if (htmlContent) {
                    message = {
                        html: htmlContent,
                        changes: "HTML code generated from code block",
                    };
                } else {
                    // Empty code block, treat as plain message
                    message = aiResponse;
                }
            } else {
                // No code block found, treat as plain message
                message = aiResponse;
            }
        }

        // Return the response in the expected format
        return NextResponse.json({
            message,
        });
    } catch (error) {
        console.error(
            "Error in chat endpoint:",
            error.networkError?.result?.errors || error,
        );
        return NextResponse.json(
            { error: "Failed to process chat message" },
            { status: 500 },
        );
    }
}
