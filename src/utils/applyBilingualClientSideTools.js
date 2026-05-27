/**
 * Merges English `description` and optional `descriptionAr` on client-side tool
 * definitions before they are stringified to the stream API. When not in RTL, only
 * strips `descriptionAr` so the API never receives unknown fields.
 */
export const BILINGUAL_CLIENT_TOOL_DESC_SEPARATOR = "\n\n---\n\n";

export function applyBilingualClientSideTools(tools, isRtl) {
    if (!Array.isArray(tools) || !tools.length) {
        return tools;
    }
    return tools.map((tool) => mergeOneClientSideTool(tool, isRtl));
}

function mergeOneClientSideTool(tool, isRtl) {
    let copy;
    try {
        copy = structuredClone(tool);
    } catch {
        copy = JSON.parse(JSON.stringify(tool));
    }
    if (!copy?.function) {
        return copy;
    }
    if (
        isRtl &&
        typeof copy.function.description === "string" &&
        typeof copy.function.descriptionAr === "string" &&
        copy.function.descriptionAr.trim() !== ""
    ) {
        copy.function.description = `${copy.function.description}${BILINGUAL_CLIENT_TOOL_DESC_SEPARATOR}${copy.function.descriptionAr.trim()}`;
    }
    delete copy.function.descriptionAr;
    return copy;
}
