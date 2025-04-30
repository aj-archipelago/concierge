import { NextResponse } from "next/server";
import { getClient } from "../../../../../../src/graphql";
import { QUERIES } from "../../../../../../src/graphql";
import LLM from "../../../../models/llm";

export async function POST(request, { params }) {
    try {
        const { messages, model, currentHtml } = await request.json();
        
        if (!model) {
            return NextResponse.json(
                { error: "Model ID is required" },
                { status: 400 }
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
            .map(msg => `${msg.role}: ${msg.content}`)
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
                ${currentHtml || 'No existing HTML provided - creating new component'}

                When creating UI components, follow these styling guidelines:
                - Use a white background (bg-white) with dark text (text-gray-800 for primary text, text-gray-600 for secondary text)
                - Apply rounded corners with rounded-md to containers, buttons, and input elements
                - Use shadow-sm for subtle depth or shadow-md for more prominent elements
                - Use consistent padding (p-4 for containers, p-2 or p-3 for smaller elements)
                - Add spacing between buttons and other elements. 
                
                Keep your HTML responses simple and use Tailwind CSS for styling and inline JavaScript for interactivity. Focus on creating clean, responsive, and accessible components. When responding with HTML, include only the HTML code with any necessary inline JavaScript in <script> tags or event handlers. Do not include additional text or comments.`
            }
        });

        // Extract the AI's response
        const aiResponse = response.data[pathwayName].result;

        // Return the response in the expected format
        return NextResponse.json({
            message: aiResponse
        });
    } catch (error) {
        console.error("Error in chat endpoint:", error);
        return NextResponse.json(
            { error: "Failed to process chat message" },
            { status: 500 }
        );
    }
}
