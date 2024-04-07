import { getClient, QUERIES } from "../../../src/graphql";
import Run from "../models/run";
import { getCurrentUser } from "../utils/auth";

export async function POST(req, res) {
    const body = await req.json();
    const { text, prompt, systemPrompt, model, workspaceId } = body;
    const user = await getCurrentUser();

    try {
        let responseText;

        if (model === "4.0") {
            const response = await getClient().query({
                query: QUERIES.RUN_GPT4,
                variables: {
                    text,
                    prompt,
                    systemPrompt,
                },
            });
            responseText = response.data.run_gpt4.result;
        } else {
            const response = await getClient().query({
                query: QUERIES.RUN_GPT35TURBO,
                variables: {
                    text,
                    prompt,
                    systemPrompt,
                },
            });

            responseText = response.data.run_gpt35turbo.result;
        }

        const run = await Run.create({
            output: responseText,
            owner: user._id,
            workspace: workspaceId,
        });

        return Response.json(run);
    } catch (error) {
        console.error(error);
        return Response.json({ message: error.message }, { status: 500 });
    }
}

export const dynamic = "force-dynamic"; // defaults to auto
