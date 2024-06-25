import { QUERIES, getClient } from "../../../../../src/graphql";
import { serverUrl } from "../../../../layout";

export const generateDigestBlockContent = async (block, user) => {
    const { prompt } = block;

    const variables = {
        chatHistory: { role: "user", content: prompt },
        contextId: user?.contextId,
    };

    const client = getClient(serverUrl);
    const result = await client.query({
        query: QUERIES.RAG_START,
        variables,
    });

    let resultMessage = "";
    let searchRequired = false;
    let tool = null;

    try {
        const resultObj = JSON.parse(result.data.rag_start.result);
        resultMessage = resultObj?.response;

        tool = result.data.rag_start.tool;
        if (tool) {
            const toolObj = JSON.parse(result.data.rag_start.tool);
            searchRequired = toolObj?.search;
        }
    } catch (e) {
        handleError(e);
        resultMessage = e.message;
    }

    let content;

    if (searchRequired) {
        const result = await client.query({
            query: QUERIES.RAG_GENERATOR_RESULTS,
            variables,
        });

        const { result: message, tool } = result.data.rag_generator_results;
        content = JSON.stringify({ payload: message, tool });
    }

    return content;
};
