import { withStoragePrincipal } from "../../app/api/utils/storage-grants.mjs";
import { QUERIES } from "../graphql.mjs";
import { runDigestQuery } from "./async-query.js";
import { DEFAULT_CHAT_MODEL } from "../../src/utils/constants.js";
import {
    buildFileAccessPlan,
    buildRunContext,
} from "../../src/utils/fileAccessPlanUtils.js";

const APPROXIMATE_DURATION_SECONDS = 60;
const PROGRESS_UPDATE_INTERVAL = 3000;

const DIGEST_LANGUAGE_INSTRUCTIONS = {
    ar: "Write the report in Arabic unless the user's request explicitly asks for a different language.",
    en: "Write the report in English unless the user's request explicitly asks for a different language.",
};

const getDigestLanguageInstruction = (language) =>
    DIGEST_LANGUAGE_INSTRUCTIONS[language] || null;

const generateDigestBlockContentInternal = async (
    block,
    user,
    logger,
    onProgressUpdate,
    { language, signal, deadline } = {},
) => {
    const { prompt } = block;

    const systemContent = [
        "Your output is being displayed in the user interface, not in a chat conversation. The user cannot respond to your messages. Please complete the requested task fully and do not ask follow-up questions or otherwise attempt to engage the user in conversation.",
    ];
    const languageInstruction = getDigestLanguageInstruction(language);
    if (languageInstruction) systemContent.push(languageInstruction);

    const systemMessage = {
        role: "system",
        content: systemContent,
    };

    const fileAccessPlan = buildFileAccessPlan({
        userContextId: user?.contextId || null,
        userContextKey: user?.contextKey || null,
    });
    const runContext = buildRunContext({
        userContextId: user?.contextId || null,
        userContextKey: user?.contextKey || null,
    });

    const variables = {
        chatHistory: [systemMessage, { role: "user", content: [prompt] }],
        fileAccessPlan,
        contextId: runContext.contextId,
        contextKey: runContext.contextKey,
        entityId: user?.personalEntityId || "",
        aiName: user?.aiName,
        model: user?.agentModel || DEFAULT_CHAT_MODEL,
        useMemory: true,
    };

    let progress = { progress: 0.05 };
    let progressUpdates = Promise.resolve();
    const updateProgress = (value) => {
        progressUpdates = progressUpdates
            .then(() => onProgressUpdate(value))
            .catch(() => {});
        return progressUpdates;
    };
    const interval = setInterval(() => {
        const increment =
            PROGRESS_UPDATE_INTERVAL / (APPROXIMATE_DURATION_SECONDS * 1000);
        if (progress.progress >= 0.95) return;
        progress.progress = Math.min(progress.progress + increment, 0.95);
        const progressUpdate = Math.floor(progress.progress * 100);
        void updateProgress(progressUpdate);
        logger.log(`progress ${progressUpdate}`, user?._id, block?._id);
    }, PROGRESS_UPDATE_INTERVAL);

    try {
        const { result, tool } = await runDigestQuery({
            query: QUERIES.SYS_ENTITY_AGENT,
            field: "sys_entity_agent",
            variables,
            timeoutMs: 20 * 60 * 1000,
            signal,
            deadline,
            logger,
            logContext: [user?._id, block?._id],
        });
        clearInterval(interval);
        await updateProgress(100);
        return JSON.stringify({ payload: result, tool });
    } finally {
        clearInterval(interval);
        await progressUpdates;
    }
};

const generateDigestBlockContent = (block, user, ...args) =>
    withStoragePrincipal(user, () =>
        generateDigestBlockContentInternal(block, user, ...args),
    );
export { generateDigestBlockContent, getDigestLanguageInstruction };
