const APPROXIMATE_DURATION_SECONDS = 60;
const PROGRESS_UPDATE_INTERVAL = 3000;

const generateDigestBlockContent = async (
    block,
    user,
    logger,
    onProgressUpdate,
) => {
    let graphql = await import("../graphql.mjs");
    const { QUERIES, getClient } = graphql;
    const { prompt } = block;

    const variables = {
        chatHistory: [{ role: "user", content: [prompt] }],
        contextId: user?.contextId,
        aiName: user?.aiName,
        aiStyle: user?.aiStyle,
        useMemory: true,
    };

    const client = await getClient();
    let searchRequired = false;
    let tool = null;
    let content;
    let progress = { progress: 0.05 };
    const interval = setInterval(() => {
        const increment =
            PROGRESS_UPDATE_INTERVAL / (APPROXIMATE_DURATION_SECONDS * 1000);
        progress.progress = Math.min(progress.progress + increment, 0.95);
        const progressUpdate = Math.floor(progress.progress * 100);
        onProgressUpdate(progressUpdate);
        logger.log(`progress ${progressUpdate}`, user?._id, block?._id);
    }, PROGRESS_UPDATE_INTERVAL);

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
            logger.log(
                "received searchRequired false, returning empty content.",
                user?._id,
                block?._id,
            );
        }
    } catch (e) {
        logger.log(
            `Error while generating content: ${e.message}`,
            user?._id,
            block?._id,
        );
        content = JSON.stringify({
            payload: "Error while generating content: " + e.message,
        });
    } finally {
        clearInterval(interval);
        onProgressUpdate(1);
    }

    return content;
};

const generateDigestGreeting = async (user, text, logger) => {
    console.log("Generating greeting for user", user?._id);
    let graphql = await import("../graphql.mjs");
    const { QUERIES, getClient } = graphql;

    const client = await getClient();
    const variables = {
        text,
        contextId: user?.contextId,
        aiName: user?.aiName,
    };

    try {
        const result = await client.query({
            query: QUERIES.GREETING,
            variables,
        });

        return result.data.greeting.result;
    } catch (e) {
        logger.log(`Error while generating greeting: ${e.message}`, user?._id);
        return null;
    }
};

module.exports = {
    generateDigestBlockContent,
    generateDigestGreeting,
};
