/**
 * @jest-environment node
 */

describe("task-progress-state helpers", () => {
    let helpers;

    beforeAll(async () => {
        helpers = await import("../task-progress-state.mjs");
    });

    test("remembers the last non-empty progress payload", () => {
        const state = helpers.rememberLatestProgressPayload(
            { dataObject: null, infoObject: null },
            {
                rawData: '{"output":"https://example.com/image.webp"}',
                parsedData: { output: "https://example.com/image.webp" },
                rawInfo: '{"artifacts":[]}',
                parsedInfo: { artifacts: [] },
            },
        );

        expect(state).toEqual({
            dataObject: { output: "https://example.com/image.webp" },
            infoObject: { artifacts: [] },
        });
    });

    test("does not overwrite cached payload with empty terminal values", () => {
        const state = helpers.rememberLatestProgressPayload(
            {
                dataObject: { output: "https://example.com/image.webp" },
                infoObject: { artifacts: [] },
            },
            {
                rawData: "",
                parsedData: null,
                rawInfo: "",
                parsedInfo: null,
            },
        );

        expect(state).toEqual({
            dataObject: { output: "https://example.com/image.webp" },
            infoObject: { artifacts: [] },
        });
    });

    test("falls back to cached payload on an empty completion event", () => {
        const payload = helpers.resolveCompletionPayload({
            currentDataObject: null,
            currentInfoObject: null,
            lastDataObject: { output: "https://example.com/image.webp" },
            lastInfoObject: { artifacts: [] },
        });

        expect(payload).toEqual({
            dataObject: { output: "https://example.com/image.webp" },
            infoObject: { artifacts: [] },
        });
    });

    test("detects usable media completion data", () => {
        expect(
            helpers.hasUsableMediaCompletionData({
                azureUrl: "https://example.com/image.webp",
            }),
        ).toBe(true);
        expect(helpers.hasUsableMediaCompletionData({})).toBe(false);
        expect(helpers.hasUsableMediaCompletionData(null)).toBe(false);
    });
});
