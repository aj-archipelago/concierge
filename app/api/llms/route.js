import LLM from "../models/llm";

export async function GET() {
    const llms = await LLM.find();
    return Response.json(llms);
}

export const dynamic = "force-dynamic"; // defaults to auto
