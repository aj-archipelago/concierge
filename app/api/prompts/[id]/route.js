import Prompt from "../../models/prompt";

export async function GET(req, { params }) {
    const { id } = params;
    try {
        const prompt = await Prompt.findById(id);
        return Response.json(prompt);
    } catch (e) {
        return Response.json({ message: e.message }, { status: 500 });
    }
}
