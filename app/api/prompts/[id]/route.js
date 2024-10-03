import Prompt from "../../models/prompt";
import Pathway, { generateRandomString } from "../../models/pathway";
import { getClient, MUTATIONS } from "../../../../src/graphql";
import { getCurrentUser } from "../../utils/auth";
import LLM from "../../models/llm"; // Assuming LLM model is defined elsewhere
import stringcase from "stringcase";

export async function GET(req, { params }) {
    const { id } = params;
    try {
        const prompt = await Prompt.findById(id);
        return Response.json(prompt);
    } catch (e) {
        return Response.json({ message: e.message }, { status: 500 });
    }
}

export async function PUT(req, { params }) {
    const { id } = params;
    const attrs = await req.json();
    const user = await getCurrentUser();

    try {
        const prompt = await Prompt.findById(id);

        if (!prompt.owner.equals(user._id)) {
            return Response.json(
                { error: "You are not the owner of this prompt" },
                { status: 403 },
            );
        }

        const updatedPrompt = await Prompt.findByIdAndUpdate(id, attrs, {
            new: true,
        });

        return Response.json(updatedPrompt);
    } catch (e) {
        console.error(e);
        return Response.json({ error: e.message }, { status: 500 });
    }
}
