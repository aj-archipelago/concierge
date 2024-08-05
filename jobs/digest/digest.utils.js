const generateDigestBlockContent = async (block, user) => {
    let graphql = await import("../graphql.mjs");
    const { QUERIES, getClient } = graphql;
    const { prompt } = block;

    const variables = {
        chatHistory: [{ role: "user", content: [prompt] }],
        contextId: user?.contextId,
        useMemory: true,
    };

    const client = await getClient();
    let searchRequired = false;
    let tool = null;
    let content;

    try {
        const result = await client.query({
            query: QUERIES.RAG_START,
            variables,
        });

        tool = result.data.rag_start.tool;
        if (tool) {
            const toolObj = JSON.parse(result.data.rag_start.tool);
            searchRequired = toolObj?.search;
        }

        if (searchRequired) {
            const result = await client.query({
                query: QUERIES.RAG_GENERATOR_RESULTS,

                variables,
            });

            const { result: message, tool } = result.data.rag_generator_results;
            content = JSON.stringify({ payload: message, tool });
        } else {
            console.log(
                "Received searchRequired false, returning empty content.",
            );
        }
    } catch (e) {
        console.log(e);
        content = JSON.stringify({
            payload: "Error while generating content: " + e.message,
        });
    }

    return content;
};

module.exports = {
    generateDigestBlockContent,
};
