import { NextResponse } from "next/server";
import { getClient } from "../../../../../../src/graphql";
import { QUERIES } from "../../../../../../src/graphql";
import Workspace from "../../../../models/workspace";
import LLM from "../../../../models/llm";

// Dummy implementation of getSuggestions
async function getSuggestions(prompt, model) {
    const client = getClient();
    const { getWorkspacePromptQuery } = QUERIES;

    // First get the LLM model details
    const llm = await LLM.findOne({ _id: model });
    if (!llm) {
        throw new Error("LLM model not found");
    }

    // Get the pathway name from the LLM model
    const pathwayName = llm.cortexPathwayName;

    // Get the appropriate query for this pathway
    const query = getWorkspacePromptQuery(pathwayName);

    console.log("prompt", prompt);

    const response = await client.query({
        query,
        variables: {
            text: "Generate UI applet suggestions for workspace",
            prompt: prompt,
            systemPrompt:
                "You are a business process app design expert. Generate applet suggestions and return them as a JSON array of objects, where each object has 'name' and 'ux_description' fields. Example format: [{\"name\": \"Email Classifier\", \"ux_description\": \"Layout:\\n- Two-column interface\\n  - Navigation sidebar on left (20% width)\\n  - Main content area (80% width)\\n\\nInput Section:\\n- Top bar contains email import button and drag-drop zone\\n- Main area has a data grid showing emails with columns for:\\n  - Subject\\n  - Sender\\n  - Date\\n  - Category\\n\\nInteractive Elements:\\n- Each email row has checkboxes for bulk actions\\n- Double-click to open detail view\\n\\nButtons:\\n- 'Import Emails' (top-left)\\n- 'Bulk Categorize' (top-right)\\n- 'Export Report' (bottom-right)\\n\\nClassification Panel:\\n- Right-side drawer opens on email selection\\n- Category dropdown\\n- Confidence score gauge\\n- Manual override options\\n\\nFeatures:\\n- Real-time category suggestions\\n- Customizable category tags with color coding\\n- Keyboard shortcuts for quick categorization\"}]. Provide detailed UI/UX specifications for each applet, including layout, inputs, outputs, buttons, interactions, and workflows. Do not wrap the output in backticks.",
        },
    });

    try {
        // Parse the JSON response and clean up the string
        let resultString = response.data[pathwayName].result;
        // Remove markdown code blocks, newlines, and any extra whitespace
        resultString = resultString
            .replace(/```json\n|```/g, "") // Remove ```json and ``` markers
            .replace(/\n/g, "") // Remove newlines
            .trim(); // Remove extra whitespace

        const parsedSuggestions = JSON.parse(resultString);

        // Ensure we have an array of objects with required fields
        if (
            !Array.isArray(parsedSuggestions) ||
            !parsedSuggestions.every(
                (item) =>
                    item.hasOwnProperty("name") &&
                    item.hasOwnProperty("ux_description"),
            )
        ) {
            throw new Error("Response does not match required format");
        }

        return {
            suggestions: parsedSuggestions,
        };
    } catch (error) {
        console.error("Failed to parse suggestions:", error);
        return {
            suggestions: [],
        };
    }
}

export async function POST(request, { params }) {
    try {
        // Get workspace ID from route params
        const { id } = params;

        // Get model from request body
        const { model } = await request.json();

        if (!model) {
            return NextResponse.json(
                { error: "Model parameter is required" },
                { status: 400 },
            );
        }

        // Fetch workspace with populated prompts
        const workspace = await Workspace.findById(id).populate("prompts");

        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 },
            );
        }

        // Construct the prompt for UI suggestions
        const contextPrompt = `
            A workspace is a collection of prompts. It is also accompanied by an applet that can be used to accomplish certain business tasks. The applet has access to the prompts. Generate applet suggestions for a workspace titled "${workspace.name}".
            
            This workspace contains the following prompts:
            ${workspace.prompts
                .map(
                    (prompt) => `
                Title: ${prompt.title}
                Content: ${prompt.text}
            `,
                )
                .join("\n")}
            
            Based on the workspace name and its prompts, come up with ideas for applets that would best serve this workspace's purpose. For each applet suggestion, provide comprehensive UI/UX details including:
            - Input fields and their types (text, number, dropdown, etc.)
            - Output format and display
            - Button placements and their actions
            - Layout structure (sections, panels, tabs if any)
            - Data visualization elements (if applicable)
            - Key interactive elements
            - Primary user workflows
            - Any special UI components or features
            
            Be specific and detailed about the interface elements while keeping the suggestions practical and implementable.
        `;

        // Get suggestions using the constructed prompt
        const suggestions = await getSuggestions(contextPrompt, model);

        return NextResponse.json(suggestions);
    } catch (error) {
        console.error("Error generating UI suggestions:", error);
        return NextResponse.json(
            { error: "Failed to generate UI suggestions" },
            { status: 500 },
        );
    }
}
