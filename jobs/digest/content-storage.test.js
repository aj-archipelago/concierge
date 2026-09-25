/** @jest-environment node */
import {
    compactDigestContent,
    hydrateDigestContent,
} from "./content-storage.js";

describe("digest citation storage", () => {
    it("preserves report text, source order and every citation byte", () => {
        const tool = JSON.stringify({
            toolUsed: ["Search"],
            citations: Array.from({ length: 15 }, (_, i) => ({
                searchResultId: `source-${i}`,
                title: `خبر ${i}`,
                url: `https://example.com/${i}`,
                content: "نص المصدر الكامل مع التشكيلَ\n".repeat(2000),
            })),
        });
        const content = JSON.stringify({
            payload: "Report :cd_source[source-12]",
            tool,
        });
        const compact = compactDigestContent(content);
        expect(Buffer.byteLength(compact)).toBeLessThan(
            Buffer.byteLength(content) / 10,
        );
        expect(JSON.parse(hydrateDigestContent(compact))).toEqual(
            JSON.parse(content),
        );
        expect(JSON.parse(compact).payload).toBe(
            "Report :cd_source[source-12]",
        );
        expect(JSON.parse(JSON.parse(compact).tool).citations[12].url).toBe(
            "https://example.com/12",
        );
        expect(compactDigestContent(compact)).toBe(compact);
    });
    it.each([undefined, null, "plain text", '{"payload":"legacy report"}'])(
        "preserves legacy content %s",
        (content) => {
            expect(compactDigestContent(content)).toBe(content);
            expect(hydrateDigestContent(content)).toBe(content);
        },
    );
    it("reports corrupt archives instead of silently losing source content", () => {
        expect(() =>
            hydrateDigestContent(
                JSON.stringify({ payload: "report", toolGzip: "invalid" }),
            ),
        ).toThrow();
    });
});
