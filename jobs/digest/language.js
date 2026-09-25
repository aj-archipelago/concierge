import UserState from "../../app/api/models/user-state.mjs";

const SUPPORTED_DIGEST_LANGUAGES = new Set(["ar", "en"]);

function parsePreferredDigestLanguage(serializedState) {
    if (!serializedState) return null;

    try {
        const userState = JSON.parse(serializedState);
        const language = String(userState?.preferences?.language || "")
            .trim()
            .toLowerCase()
            .split("-")[0];

        return SUPPORTED_DIGEST_LANGUAGES.has(language) ? language : null;
    } catch {
        return null;
    }
}

async function getPreferredDigestLanguage(userId, logger) {
    try {
        const userState = await UserState.findOne({ user: userId });
        return parsePreferredDigestLanguage(userState?.serializedState);
    } catch (error) {
        logger?.log(
            `[Digest] Could not load language preference: ${error.message}`,
            userId,
        );
        return null;
    }
}

export { getPreferredDigestLanguage, parsePreferredDigestLanguage };
