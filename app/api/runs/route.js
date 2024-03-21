import { getClient, QUERIES } from "../../../src/graphql";

export async function POST(req, res) {
    const body = await req.json();
    const { text, prompt, systemPrompt } = body;

    try {
        const response = await getClient().query({
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
        return Response.json({ message: error.message }, { status: 500 });
    }
}
