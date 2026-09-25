/** Authoring tripwire only: dynamic/obfuscated code can evade this scan. */
export function usesSourceQa(source) {
    return (
        typeof source === "string" &&
        /\bsourceQa\b|\/api\/applet\/source-qa\b/.test(source)
    );
}

export function reviewAppletApis(source) {
    if (!usesSourceQa(source)) return [];
    return [
        {
            code: "APPLET_SOURCE_QA_REVIEW_REQUIRED",
            message:
                "This applet references the restricted Source Q&A service, which is not available for new applet integrations. Use a documented model, personal-agent, or data/search API instead.",
        },
    ];
}
