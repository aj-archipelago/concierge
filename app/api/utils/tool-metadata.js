export function parseToolMetadata(tool) {
    if (!tool || typeof tool !== "string") {
        return { metadata: {}, citations: [] };
    }

    try {
        const parsed = JSON.parse(tool);
        const metadata =
            parsed && typeof parsed === "object" && !Array.isArray(parsed)
                ? parsed
                : {};
        return {
            metadata,
            citations: Array.isArray(metadata.citations)
                ? metadata.citations
                : [],
        };
    } catch (error) {
        console.error("Error parsing tool metadata:", error);
        return { metadata: {}, citations: [] };
    }
}
