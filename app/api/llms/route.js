import LLM from "../models/llm";

export async function GET() {
    const llms = await LLM.find();
    // Sort alphabetically by name
    llms.sort((a, b) => a.name.localeCompare(b.name));
    return Response.json(llms);
}

export const dynamic = "force-dynamic"; // defaults to auto
