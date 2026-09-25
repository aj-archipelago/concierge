import { gzipSync, gunzipSync } from "node:zlib";

const MIN_TOOL_BYTES = 16 * 1024;
const MAX_TOOL_BYTES = 16 * 1024 * 1024;

// Digest blocks remain one CSFLE-encrypted array. Compress only the bulky
// source metadata inside content; preserve the report and every source byte.
// Keep source labels/links readable by the immediately preceding release.
export function compactDigestContent(content) {
    if (typeof content !== "string") return content;
    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch {
        return content;
    }
    if (!parsed || typeof parsed.tool !== "string" || parsed.toolGzip)
        return content;
    if (
        Buffer.byteLength(parsed.tool) < MIN_TOOL_BYTES ||
        Buffer.byteLength(parsed.tool) > MAX_TOOL_BYTES
    )
        return content;
    let tool;
    try {
        tool = JSON.parse(parsed.tool);
    } catch {
        return content;
    }
    if (!tool || !Array.isArray(tool.citations)) return content;
    const compressed = gzipSync(Buffer.from(parsed.tool)).toString("base64");
    const fallback = {
        ...tool,
        citations: tool.citations.map((citation) => {
            if (!citation || typeof citation !== "object") return citation;
            const { content: _content, ...metadata } = citation;
            return metadata;
        }),
    };
    const stored = JSON.stringify({
        ...parsed,
        tool: JSON.stringify(fallback),
        toolGzip: compressed,
    });
    return Buffer.byteLength(stored) < Buffer.byteLength(content)
        ? stored
        : content;
}

export function hydrateDigestContent(content) {
    if (typeof content !== "string") return content;
    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch {
        return content;
    }
    if (!parsed?.toolGzip) return content;
    const { toolGzip, ...rest } = parsed;
    const tool = gunzipSync(Buffer.from(toolGzip, "base64"), {
        maxOutputLength: MAX_TOOL_BYTES,
    }).toString("utf8");
    JSON.parse(tool);
    return JSON.stringify({ ...rest, tool });
}

export function compactDigestBlocks(blocks) {
    return blocks.map((block) => ({
        ...(block.toObject ? block.toObject() : block),
        content: compactDigestContent(block.content),
    }));
}
