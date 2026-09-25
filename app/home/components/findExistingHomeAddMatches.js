const MATCH_STOPWORDS = new Set([
    "a",
    "an",
    "and",
    "any",
    "app",
    "applet",
    "applets",
    "apps",
    "at",
    "build",
    "by",
    "create",
    "dashboard",
    "dashboards",
    "for",
    "from",
    "generate",
    "home",
    "i",
    "in",
    "interactive",
    "it",
    "like",
    "make",
    "me",
    "my",
    "need",
    "new",
    "of",
    "on",
    "or",
    "page",
    "please",
    "report",
    "reports",
    "some",
    "something",
    "the",
    "this",
    "that",
    "to",
    "tool",
    "tools",
    "want",
    "we",
    "widget",
    "widgets",
    "with",
    "you",
    "أو",
    "إلى",
    "ال",
    "أتمتة",
    "أتمتات",
    "أن",
    "تطبيق",
    "تطبيقات",
    "على",
    "في",
    "من",
    "هذا",
    "هذه",
    "و",
]);

export function normalizeHomeAddMatchText(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u064B-\u065F\u0670]/g, "")
        .replace(/[^\p{L}\p{N}\s]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function tokenize(value) {
    return normalizeHomeAddMatchText(value).split(" ").filter(Boolean);
}

function significantTokens(value) {
    return tokenize(value).filter(
        (token) => token.length >= 3 && !MATCH_STOPWORDS.has(token),
    );
}

function tokensMatch(promptToken, itemToken) {
    if (promptToken === itemToken) return true;
    if (promptToken === `${itemToken}s` || itemToken === `${promptToken}s`) {
        return true;
    }
    if (promptToken === `${itemToken}es` || itemToken === `${promptToken}es`) {
        return true;
    }
    return false;
}

function countTokenHits(promptTokens, itemTokens) {
    return promptTokens.filter((promptToken) =>
        itemTokens.some((itemToken) => tokensMatch(promptToken, itemToken)),
    );
}

export function scoreHomeAddMatch(prompt, name, description = "") {
    const normalizedPrompt = normalizeHomeAddMatchText(prompt);
    const normalizedName = normalizeHomeAddMatchText(name);
    if (normalizedPrompt.length < 3 || !normalizedName) return 0;

    if (normalizedName === normalizedPrompt) return 100;
    if (normalizedName.includes(normalizedPrompt)) return 90;

    const promptTokens = significantTokens(prompt);
    if (promptTokens.length === 0) return 0;

    const nameTokens = tokenize(name);
    const nameHits = countTokenHits(promptTokens, nameTokens);

    if (nameHits.length === promptTokens.length) {
        return 80 + Math.min(nameHits.length * 2, 10);
    }

    if (promptTokens.length <= 3 && nameHits.length >= 1) {
        const longestHit = Math.max(...nameHits.map((token) => token.length));
        if (longestHit >= 4) return 60 + longestHit;
    }

    const descriptionHits = countTokenHits(promptTokens, tokenize(description));
    if (
        promptTokens.length === 1 &&
        descriptionHits.length === 1 &&
        descriptionHits[0].length >= 6
    ) {
        return 60;
    }

    return 0;
}

export function findExistingHomeAddMatches({
    prompt,
    applets = [],
    automations = [],
    excludedAppletIds = [],
    excludedAutomationIds = [],
    limit = 3,
} = {}) {
    const excludedAppletIdSet = new Set((excludedAppletIds || []).map(String));
    const excludedAutomationIdSet = new Set(
        (excludedAutomationIds || []).map(String),
    );

    const candidates = [
        ...applets.map((applet) => ({
            kind: "applet",
            id: String(applet.appletId),
            name: applet.name || "",
            description: applet.description || "",
            item: applet,
            alreadyOnHome: excludedAppletIdSet.has(String(applet.appletId)),
        })),
        ...automations.map((automation) => ({
            kind: "automation",
            id: String(automation._id),
            name: automation.name || "",
            description: automation.description || "",
            item: automation,
            alreadyOnHome: excludedAutomationIdSet.has(String(automation._id)),
        })),
    ];

    return candidates
        .map((candidate) => ({
            ...candidate,
            score: scoreHomeAddMatch(
                prompt,
                candidate.name,
                candidate.description,
            ),
        }))
        .filter((candidate) => candidate.score >= 60)
        .sort(
            (left, right) =>
                right.score - left.score || left.name.localeCompare(right.name),
        )
        .slice(0, limit);
}
