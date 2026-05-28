import Prompt from "../../models/prompt";

export async function GET(req, { params }) {
    params = await params;
    const { id } = params;
    try {
        const prompt = await Prompt.findById(id).populate("files");
        if (!prompt) {
            return Response.json(
                { message: "Prompt not found" },
                { status: 404 },
            );
        }
        return Response.json(prompt);
    } catch (e) {
        return Response.json({ message: e.message }, { status: 500 });
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
