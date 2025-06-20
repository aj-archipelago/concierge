import { NextResponse } from "next/server";
import { getClient } from "../../../../../../src/graphql";
import { QUERIES } from "../../../../../../src/graphql";
import LLM from "../../../../models/llm";
import Prompt from "../../../../models/prompt";

export async function POST(request, { params }) {
    try {
        let { prompt, systemPrompt, promptId } = await request.json();

        if (!prompt && !promptId) {
            return NextResponse.json(
                { error: "Either prompt or promptId is required" },
                { status: 400 },
            );
        }

        let promptToSend = prompt;
        let llm;

        // If promptId is provided, look up the prompt and its associated LLM
        if (promptId) {
            const promptDoc = await Prompt.findById(promptId);
            if (!promptDoc) {
                return NextResponse.json(
                    { error: "Prompt not found" },
                    { status: 404 },
                );
            }
            systemPrompt = promptDoc.text;

            // Get the LLM associated with the prompt
            if (promptDoc.llm) {
                llm = await LLM.findOne({ _id: promptDoc.llm });
            }
        }

        // If no LLM is found, use the default LLM
        if (!llm) {
            llm = await LLM.findOne({ isDefault: true });
        }

        const pathwayName = llm.cortexPathwayName;
        const query = QUERIES.getWorkspacePromptQuery(pathwayName);

        // Call the AI with the prompt
        const response = await getClient().query({
            query,
            variables: {
                text: promptToSend,
                prompt: promptToSend,
                systemPrompt: systemPrompt,
            },
        });

        // Extract the AI's response
        const aiResponse = response.data[pathwayName].result;

        // Return the response
        return NextResponse.json({
            output: aiResponse,
        });
    } catch (error) {
        console.error("Error in execute endpoint:", error);
        return NextResponse.json(
            { error: "Failed to execute prompt" },
            { status: 500 },
        );
    }
}
