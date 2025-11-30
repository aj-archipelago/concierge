import { QUERIES, getClient } from "../graphql.mjs";

const APPROXIMATE_DURATION_SECONDS = 60;
const PROGRESS_UPDATE_INTERVAL = 3000;

const generateDigestBlockContent = async (
    block,
    user,
    logger,
    onProgressUpdate,
) => {
    const { prompt } = block;

    const systemMessage = {
        role: "system",
        content: [
            "Your output is being displayed in the user interface, not in a chat conversation. The user cannot respond to your messages. Please complete the requested task fully and do not ask follow-up questions or otherwise attempt to engage the user in conversation.",
        ],
    };

    const variables = {
        chatHistory: [systemMessage, { role: "user", content: [prompt] }],
        contextId: user?.contextId,
        contextKey: user?.contextKey,
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
                payload: result.data.sys_entity_agent.result,
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
        console.error(e);
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

export { generateDigestBlockContent, generateDigestGreeting };
