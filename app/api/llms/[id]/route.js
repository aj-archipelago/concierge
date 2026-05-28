import LLM from "../../models/llm";

export async function GET(req, { params }) {
    params = await params;
    const { id } = params;
    const llm = await LLM.findById(id);
    return Response.json(llm);
}
