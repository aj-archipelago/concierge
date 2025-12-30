import { getPromptWithMigration } from "../../utils/prompt-utils";

export async function GET(req, { params }) {
    const { id } = params;
    try {
        // Automatically migrate if needed when fetching prompt
        const promptData = await getPromptWithMigration(id);
        if (!promptData) {
            return Response.json(
                { message: "Prompt not found" },
                { status: 404 },
            );
        }
        return Response.json(promptData.prompt);
    } catch (e) {
        return Response.json({ message: e.message }, { status: 500 });
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
