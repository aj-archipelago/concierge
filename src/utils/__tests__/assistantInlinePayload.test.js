import {
    buildModelPayloadFromStoredPayload,
    extractPreviewTextFromStoredPayload,
    extractSearchableText,
    serializeAssistantPayloadItem,
    createAssistantTextItem,
    createAssistantThinkingItem,
    createAssistantToolEventItem,
} from "../assistantInlinePayload";

describe("buildModelPayloadFromStoredPayload", () => {
    it("collapses assistant text plus thinking summary back to plain text", () => {
        const payload = [
            serializeAssistantPayloadItem(createAssistantTextItem("Hello")),
            serializeAssistantPayloadItem(createAssistantThinkingItem("", 3)),
        ];

        expect(buildModelPayloadFromStoredPayload(payload)).toBe("Hello");
    });

    it("removes assistant-only inline metadata and preserves real content", () => {
        const payload = [
            serializeAssistantPayloadItem(
                createAssistantToolEventItem({
                    callId: "tool-1",
                    userMessage: "Running search",
                }),
            ),
            serializeAssistantPayloadItem({
                type: "image_url",
                url: "https://example.com/cat.png",
            }),
            serializeAssistantPayloadItem(createAssistantTextItem("Done")),
            serializeAssistantPayloadItem(
                createAssistantThinkingItem("hidden reasoning", 5),
            ),
        ];

        expect(buildModelPayloadFromStoredPayload(payload)).toEqual([
            serializeAssistantPayloadItem({
                type: "image_url",
                url: "https://example.com/cat.png",
            }),
            serializeAssistantPayloadItem(createAssistantTextItem("Done")),
        ]);
    });

    it("drops payloads that only contain assistant metadata", () => {
        const payload = [
            serializeAssistantPayloadItem(createAssistantThinkingItem("", 2)),
            serializeAssistantPayloadItem(
                createAssistantToolEventItem({
                    callId: "tool-1",
                    userMessage: "Running search",
                }),
            ),
        ];

        expect(buildModelPayloadFromStoredPayload(payload)).toBeNull();
    });

    it("extracts preview text from stored user text payloads", () => {
        const payload = [JSON.stringify({ type: "text", text: "Where am I?" })];

        expect(extractPreviewTextFromStoredPayload(payload)).toBe(
            "Where am I?",
        );
    });
});

describe("extractSearchableText", () => {
    it("extracts text from string payload (legacy format)", () => {
        expect(extractSearchableText("hello world")).toBe("hello world");
    });

    it("extracts text from array payload (current format)", () => {
        const payload = [
            JSON.stringify({ type: "text", text: "what is 7 * 13" }),
        ];
        expect(extractSearchableText(payload)).toBe("what is 7 * 13");
    });

    it("extracts text from mixed text + image array payload", () => {
        const payload = [
            JSON.stringify({ type: "text", text: "analyze this chart" }),
            JSON.stringify({
                type: "image_url",
                url: "https://example.com/chart.png",
                displayFilename: "chart.png",
            }),
        ];
        const result = extractSearchableText(payload);
        expect(result).toContain("analyze this chart");
        expect(result).toContain("chart.png");
    });

    it("excludes thinking items from search", () => {
        const payload = [
            serializeAssistantPayloadItem(
                createAssistantThinkingItem("hidden reasoning", 5),
            ),
            serializeAssistantPayloadItem(
                createAssistantTextItem("visible response"),
            ),
        ];
        const result = extractSearchableText(payload);
        expect(result).toContain("visible response");
        expect(result).not.toContain("hidden reasoning");
    });

    it("excludes tool_event items from search", () => {
        const payload = [
            serializeAssistantPayloadItem(
                createAssistantToolEventItem({
                    callId: "tool-1",
                    userMessage: "Searching web",
                }),
            ),
            serializeAssistantPayloadItem(
                createAssistantTextItem("search results here"),
            ),
        ];
        const result = extractSearchableText(payload);
        expect(result).toContain("search results here");
        expect(result).not.toContain("Searching web");
    });

    it("extracts text from object payload", () => {
        expect(extractSearchableText({ text: "hello", type: "text" })).toBe(
            "hello",
        );
        expect(extractSearchableText({ displayFilename: "report.pdf" })).toBe(
            "report.pdf",
        );
        expect(
            extractSearchableText({ text: "doc", filename: "report.pdf" }),
        ).toBe("doc report.pdf");
    });

    it("excludes hidden object payloads", () => {
        expect(
            extractSearchableText({ type: "thinking", text: "secret" }),
        ).toBe("");
        expect(
            extractSearchableText({ type: "tool_event", text: "internal" }),
        ).toBe("");
        expect(
            extractSearchableText({ hideFromClient: true, text: "hidden" }),
        ).toBe("");
        expect(
            extractSearchableText({ hideFromModel: true, text: "hidden" }),
        ).toBe("");
        expect(
            extractSearchableText({ isDeletedFile: true, text: "deleted" }),
        ).toBe("");
    });

    it("extracts text from serialized structured string payload", () => {
        const payload = JSON.stringify({
            type: "text",
            text: "parsed correctly",
        });
        expect(extractSearchableText(payload)).toBe("parsed correctly");
    });

    it("does not leak raw JSON for serialized non-text items", () => {
        const payload = JSON.stringify({
            type: "image_url",
            url: "https://example.com/cat.png",
        });
        expect(extractSearchableText(payload)).toBe("");
    });

    it("excludes hidden serialized string payloads", () => {
        expect(
            extractSearchableText(
                JSON.stringify({ type: "thinking", text: "secret" }),
            ),
        ).toBe("");
        expect(
            extractSearchableText(
                JSON.stringify({ hideFromClient: true, text: "hidden" }),
            ),
        ).toBe("");
    });

    it("returns empty string for null/undefined/numbers", () => {
        expect(extractSearchableText(null)).toBe("");
        expect(extractSearchableText(undefined)).toBe("");
        expect(extractSearchableText(42)).toBe("");
    });

    it("returns empty string for payload with only hidden items", () => {
        const payload = [
            serializeAssistantPayloadItem(createAssistantThinkingItem("", 2)),
            serializeAssistantPayloadItem(
                createAssistantToolEventItem({
                    callId: "tool-1",
                    userMessage: "Running tool",
                }),
            ),
        ];
        expect(extractSearchableText(payload)).toBe("");
    });
});
