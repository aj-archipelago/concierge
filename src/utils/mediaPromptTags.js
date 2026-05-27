export const MAX_AUTO_TAGS = 8;

export function normalizeMediaTag(tag) {
    return String(tag || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .slice(0, 48);
}

export function mergeMediaTags(...tagLists) {
    const merged = [];
    const seen = new Set();

    for (const tagList of tagLists) {
        if (!Array.isArray(tagList)) continue;

        for (const tag of tagList) {
            const normalized = normalizeMediaTag(tag);
            if (!normalized || seen.has(normalized)) continue;
            seen.add(normalized);
            merged.push(normalized);
        }
    }

    return merged;
}

function extractJsonCandidate(value) {
    if (typeof value !== "string") return value;

    const trimmed = value.trim();
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) return fenceMatch[1].trim();

    return trimmed;
}

export function parseMediaPromptTagsResult(result) {
    if (!result) return [];

    let parsed = result;
    if (typeof parsed === "string") {
        try {
            parsed = JSON.parse(extractJsonCandidate(parsed));
        } catch {
            return mergeMediaTags(
                parsed
                    .split(/[,\n]/)
                    .map((tag) => tag.replace(/^[-*\d.\s]+/, "")),
            ).slice(0, MAX_AUTO_TAGS);
        }
    }

    const tags = Array.isArray(parsed)
        ? parsed
        : parsed?.tags || parsed?.mediaTags || parsed?.keywords || [];

    return mergeMediaTags(tags).slice(0, MAX_AUTO_TAGS);
}
