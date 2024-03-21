import { getClient, QUERIES } from "../../../src/graphql";

export async function POST(req, res) {
    const body = await req.json();
    const { text, prompt, systemPrompt } = body;
    const serverUrl = process.env.SERVER_URL;

    try {
        const response = await getClient(serverUrl).query({
            query: QUERIES.RUN_GPT35TURBO,
            variables: {
                text,
                prompt,
                systemPrompt,
            },
        });

        return Response.json(response);
    } catch (error) {
        console.error(error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
