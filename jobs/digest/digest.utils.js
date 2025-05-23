const APPROXIMATE_DURATION_SECONDS = 60;
const PROGRESS_UPDATE_INTERVAL = 3000;

const generateDigestBlockContent = async (
    block,
    user,
    logger,
    onProgressUpdate,
) => {
    let imageUtils = await import("../../src/utils/imageUtils.mjs");
    const { processImageUrls } = imageUtils;

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
            query: QUERIES.SYS_ENTITY_AGENT,
            variables,
        });

        tool = result.data.sys_entity_agent.tool;

        try {
            content = JSON.stringify({
                payload: await processImageUrls(
                    result.data.sys_entity_agent.result,
                    process.env.SERVER_URL,
                ),
                tool,
            });
        } catch (e) {
            logger.log(
                `Error while parsing sys_entity_agent result: ${e.message}`,
                user?._id,
                block?._id,
            );
            content = JSON.stringify({
                payload: JSON.stringify(result.data),
                tool: null,
            });
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
