import { getClient, QUERIES } from "../../../src/graphql";

export async function POST(req, res) {
    const body = await req.json();
    const { text, prompt } = body;
    const serverUrl = process.env.SERVER_URL;

    const response = await getClient(serverUrl).query({
        query: QUERIES.RUN_GPT35TURBO,
        variables: {
            text,
            prompt,
        },
    });

    return Response.json(response);
}
