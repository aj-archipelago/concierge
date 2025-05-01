import { NextResponse } from "next/server";
import { getClient } from "../../../../../../src/graphql";
import { QUERIES } from "../../../../../../src/graphql";
import LLM from "../../../../models/llm";

export async function POST(request, { params }) {
    try {
        const { prompt, systemPrompt } = await request.json();

        if (!prompt) {
            return NextResponse.json(
                { error: "Prompt is required" },
                { status: 400 },
            );
        }

        // Get the specified LLM model
        const llm = await LLM.findOne({ identifier: "gpt4o" });
        if (!llm) {
            throw new Error("Specified LLM model not found");
        }

        const pathwayName = llm.cortexPathwayName;
        const query = QUERIES.getWorkspacePromptQuery(pathwayName);

        // Call the AI with the prompt
        const response = await getClient().query({
            query,
            variables: {
                text: prompt,
                prompt: prompt,
                systemPrompt: systemPrompt,
            },
        });

        // Extract the AI's response
        const aiResponse = response.data[pathwayName].result;

        // Return the response
        return NextResponse.json({
            message: aiResponse,
        });
    } catch (error) {
        console.error("Error in execute endpoint:", error);
        return NextResponse.json(
            { error: "Failed to execute prompt" },
            { status: 500 },
        );
    }
}