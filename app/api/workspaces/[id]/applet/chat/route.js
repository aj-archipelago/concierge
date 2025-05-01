import { NextResponse } from "next/server";
import { getClient } from "../../../../../../src/graphql";
import { QUERIES } from "../../../../../../src/graphql";
import LLM from "../../../../models/llm";

export async function POST(request, { params }) {
    try {
        const { messages, model, currentHtml, restEndpoint } = await request.json();

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

        const pathwayName = llm.cortexPathwayName;
        const query = QUERIES.getWorkspacePromptQuery(pathwayName);

        // Get the latest message from the user
        const latestMessage = messages[messages.length - 1];

        // Prepare the conversation history for the AI
        const conversationHistory = messages
            .map((msg) => `${msg.role}: ${msg.content}`)
            .join("\n");

        // Call the AI with the conversation history
        const response = await getClient().query({
            query,
            variables: {
                text: latestMessage.content,
                prompt: conversationHistory,
                systemPrompt: `You are a UI/UX expert assistant. Your task is to help users design and create user interfaces. You can respond in two ways:
                1. With HTML/CSS code wrapped in backticks when you want to show a UI component
                2. With natural language when discussing or asking questions about the UI requirements

                IMPORTANT: When modifying existing HTML, you will be provided with the current HTML. You should:
                1. Only make the specific changes requested by the user
                2. Preserve all existing structure, classes, and functionality not related to the requested changes
                3. Return the complete HTML with your modifications
                
                Current HTML being modified:
                ${currentHtml || "No existing HTML provided - creating new component"}

                ${restEndpoint ? `You have access to a REST endpoint at ${restEndpoint} that can be used for LLM processing.
                When generating HTML components that need LLM capabilities (e.g. translation, text analysis, etc), 
                you should include the necessary JavaScript to make POST requests to this endpoint.
                
                The endpoint expects:
                - prompt: The text to be processed
                - systemPrompt: (optional) Specific instructions for the LLM

                The endpoint returns a JSON response with a 'message' field containing the LLM's output.
                
                Example usage in generated HTML:
                \`\`\`javascript
                async function processWithLLM(text) {
                    const response = await fetch('${restEndpoint}', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            prompt: text,
                            model: currentModel, // Assume this is available in the component's scope
                            systemPrompt: 'Translate to Spanish' // Example instruction
                        })
                    });
                    const data = await response.json();
                    return data.message;
                }
                \`\`\`` : ''}

                When creating UI components, follow these styling guidelines:
                - Use clean, semantic HTML with descriptive class names
                - Include a <style> tag with your CSS rules
                - Style guidelines:
                  - Use white background (background-color: #ffffff) with dark text (color: #1f2937 for primary, #4b5563 for secondary)
                  - Apply border-radius: 0.375em for rounded corners on containers, buttons, and inputs
                  - Use box-shadow: 0 0.0625em 0.125em rgba(0, 0, 0, 0.05) for subtle shadows
                  - Use box-shadow: 0 0.25em 0.375em rgba(0, 0, 0, 0.1) for more prominent elements
                  - Use consistent padding (1.25em for containers, 0.5em to 0.75em for smaller elements)
                  - Add margin of 0.75em between buttons and other elements for proper spacing`,
            },
        });

        // Extract the AI's response
        const aiResponse = response.data[pathwayName].result;

        // Return the response in the expected format
        return NextResponse.json({
            message: aiResponse,
        });
    } catch (error) {
        console.error("Error in chat endpoint:", error);
        return NextResponse.json(
            { error: "Failed to process chat message" },
            { status: 500 },
        );
    }
}
