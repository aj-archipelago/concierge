import Prompt from "../../models/prompt";
import { getCurrentUser } from "../../utils/auth";

export async function GET(req, { params }) {
    const user = await getCurrentUser();
    const { id } = params;
    //read from mongoose Prompt model for the current user
    const prompt = await Prompt.findById(id);
    return Response.json(prompt);
}

export async function PUT(req, { params }) {
    const user = await getCurrentUser();
    const { id } = params;
    const attrs = await req.json();
    const prompt = await Prompt.findByIdAndUpdate(id, attrs, { new: true });
    return Response.json(prompt);
}
