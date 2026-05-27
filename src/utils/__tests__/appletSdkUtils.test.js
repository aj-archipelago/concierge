/**
 * @jest-environment node
 */

import {
    ensureAppletRuntimeHtml,
    ensureAppletSdkScript,
} from "../appletSdkUtils.js";

describe("ensureAppletSdkScript", () => {
    describe("passthrough cases", () => {
        it("returns null unchanged", () => {
            expect(ensureAppletSdkScript(null)).toBeNull();
        });

        it("returns undefined unchanged", () => {
            expect(ensureAppletSdkScript(undefined)).toBeUndefined();
        });

        it("returns empty string unchanged", () => {
            expect(ensureAppletSdkScript("")).toBe("");
        });

        it("returns non-string input unchanged", () => {
            expect(ensureAppletSdkScript(42)).toBe(42);
        });

        it("does not inject when SDK script already present", () => {
            const html =
                '<html><head><script src="/applet-sdk.js"></script></head><body></body></html>';
            expect(ensureAppletSdkScript(html)).toBe(html);
        });

        it("does not inject when applet-sdk.js reference already in html", () => {
            const html =
                '<html><head><script src="https://example.com/applet-sdk.js?v=2"></script></head><body></body></html>';
            expect(ensureAppletSdkScript(html)).toBe(html);
        });
    });

    describe("injection into </head>", () => {
        it("injects SDK script before </head>", () => {
            const html =
                "<html><head><title>Test</title></head><body></body></html>";
            const result = ensureAppletSdkScript(html);
            expect(result).toContain('<script src="/applet-sdk.js"></script>');
            expect(result.indexOf("applet-sdk.js")).toBeLessThan(
                result.indexOf("</head>"),
            );
        });

        it("is case-insensitive for </head>", () => {
            const html =
                "<HTML><HEAD><TITLE>Test</TITLE></HEAD><BODY></BODY></HTML>";
            const result = ensureAppletSdkScript(html);
            expect(result).toContain('<script src="/applet-sdk.js"></script>');
        });

        it("preserves existing head content when injecting", () => {
            const html =
                '<html><head><meta charset="utf-8"><title>My App</title></head><body></body></html>';
            const result = ensureAppletSdkScript(html);
            expect(result).toContain('charset="utf-8"');
            expect(result).toContain("<title>My App</title>");
            expect(result).toContain('<script src="/applet-sdk.js"></script>');
        });
    });

    describe("injection before </body>", () => {
        it("injects SDK before </body> when no </head>", () => {
            const html = "<html><body><p>Content</p></body></html>";
            const result = ensureAppletSdkScript(html);
            expect(result).toContain('<script src="/applet-sdk.js"></script>');
            expect(result.indexOf("applet-sdk.js")).toBeLessThan(
                result.indexOf("</body>"),
            );
        });

        it("is case-insensitive for </body>", () => {
            const html = "<HTML><BODY><P>Content</P></BODY></HTML>";
            const result = ensureAppletSdkScript(html);
            expect(result).toContain('<script src="/applet-sdk.js"></script>');
        });
    });

    describe("prepend fallback", () => {
        it("prepends SDK script when no structural tags present", () => {
            const html = "<div>Hello World</div>";
            const result = ensureAppletSdkScript(html);
            expect(result).toBe(
                '<script src="/applet-sdk.js"></script>\n<div>Hello World</div>',
            );
        });

        it("prepends SDK script for plain text content", () => {
            const html = "Just some text";
            const result = ensureAppletSdkScript(html);
            expect(result).toBe(
                '<script src="/applet-sdk.js"></script>\nJust some text',
            );
        });
    });

    describe("injection priority", () => {
        it("prefers </head> injection over </body> when both present", () => {
            const html = "<html><head></head><body></body></html>";
            const result = ensureAppletSdkScript(html);
            // SDK should appear before </head>, not before </body>
            expect(result.indexOf("applet-sdk.js")).toBeLessThan(
                result.indexOf("</head>"),
            );
        });
    });

    describe("runtime applet metadata", () => {
        it("injects the applet-id meta tag when an applet id is provided", () => {
            const html = "<html><head></head><body></body></html>";
            const result = ensureAppletRuntimeHtml(html, {
                appletId: "applet-123",
            });

            expect(result).toContain(
                '<meta name="applet-id" content="applet-123">',
            );
            expect(result.indexOf("applet-id")).toBeLessThan(
                result.indexOf("</head>"),
            );
        });

        it("replaces an existing applet-id meta tag", () => {
            const html =
                '<html><head><meta name="applet-id" content="old-id"></head><body></body></html>';
            const result = ensureAppletRuntimeHtml(html, {
                appletId: "new-id",
            });

            expect(result).toContain(
                '<meta name="applet-id" content="new-id">',
            );
            expect(result).not.toContain('content="old-id"');
        });
    });
});
