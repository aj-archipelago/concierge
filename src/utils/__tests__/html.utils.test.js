/**
 * @jest-environment node
 */

import { stripHTML } from "../html.utils";

describe("stripHTML", () => {
    test("extracts plain text and preserves paragraph breaks", () => {
        const html = "<p>Hello</p><p>World</p>";
        expect(stripHTML(html)).toBe("Hello\n\nWorld");
    });

    test("decodes HTML entities", () => {
        expect(stripHTML("Tom &amp; Jerry")).toBe("Tom & Jerry");
        expect(stripHTML("1 &lt; 2")).toBe("1 < 2");
    });

    test("removes script and style blocks including malformed closing tags", () => {
        const html =
            "<style>body { color: red; }</style ><p>Safe</p><script>alert(1)</script >";
        expect(stripHTML(html)).toBe("Safe");
    });

    test("iteratively removes nested script blocks", () => {
        const html = "<script><script>alert(1)</script></script><p>Safe</p>";
        expect(stripHTML(html)).toBe("Safe");
    });

    test("strips entity-encoded script tags after decoding", () => {
        expect(stripHTML("&lt;script&gt;alert(1)&lt;/script&gt;Safe")).toBe(
            "Safe",
        );
    });

    test("does not double-decode escaped entities", () => {
        expect(stripHTML("&amp;lt;")).toBe("&lt;");
    });
});
