import {
    extractHtmlStructure,
    filterAppletParams,
    filterDarkClasses,
    generateFilteredSandboxHtml,
    normalizeAppletLocale,
    parseAppletParams,
} from "../themeUtils";

describe("themeUtils", () => {
    describe("extractHtmlStructure", () => {
        it("extracts head and body from complete HTML", () => {
            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Test</title>
                </head>
                <body>
                    <div>Body content</div>
                </body>
                </html>
            `;
            const { headContent, bodyContent } = extractHtmlStructure(html);
            expect(headContent).toContain("charset");
            expect(headContent).toContain("Test");
            expect(bodyContent).toContain("Body content");
        });
    });

    describe("filterDarkClasses", () => {
        it("removes dark: classes when theme is light", () => {
            const html = '<div class="bg-white dark:bg-gray-800">Text</div>';
            expect(filterDarkClasses(html, "light")).toBe(
                '<div class="bg-white ">Text</div>',
            );
        });

        it("keeps dark: classes when theme is dark", () => {
            const html = '<div class="bg-white dark:bg-gray-800">Text</div>';
            expect(filterDarkClasses(html, "dark")).toBe(html);
        });
    });

    describe("normalizeAppletLocale", () => {
        it("maps en to ltr", () => {
            expect(normalizeAppletLocale("en")).toEqual({
                language: "en",
                direction: "ltr",
            });
        });

        it("maps ar to rtl", () => {
            expect(normalizeAppletLocale("ar")).toEqual({
                language: "ar",
                direction: "rtl",
            });
        });

        it("falls back unknown languages to en", () => {
            expect(normalizeAppletLocale("fr")).toEqual({
                language: "en",
                direction: "ltr",
            });
        });
    });

    describe("parseAppletParams", () => {
        it("parses query params from a search string", () => {
            expect(parseAppletParams("?team=team-alpha&userId=abc")).toEqual({
                team: "team-alpha",
                userId: "abc",
            });
        });

        it("excludes Concierge-internal query params", () => {
            expect(
                parseAppletParams(
                    "team=team-alpha&openChat=123&openCanvasApplet=456",
                ),
            ).toEqual({
                team: "team-alpha",
            });
        });

        it("rejects prototype-pollution query keys", () => {
            expect(
                parseAppletParams(
                    "team=team-alpha&__proto__=polluted&constructor=Object&prototype=polluted",
                ),
            ).toEqual({
                team: "team-alpha",
            });
        });
    });

    describe("filterAppletParams", () => {
        it("excludes reserved and unsafe keys from param objects", () => {
            expect(
                filterAppletParams({
                    team: "team-alpha",
                    openChat: "123",
                    __proto__: "polluted",
                    constructor: "polluted",
                    prototype: "polluted",
                }),
            ).toEqual({
                team: "team-alpha",
            });
        });

        it("ignores non-string values", () => {
            expect(
                filterAppletParams({
                    team: "team-alpha",
                    count: 42,
                }),
            ).toEqual({
                team: "team-alpha",
            });
        });
    });

    describe("generateFilteredSandboxHtml", () => {
        it("includes Tailwind script in output", () => {
            const content = "<div>Test applet</div>";
            const result = generateFilteredSandboxHtml(content, "light");

            expect(result).toContain("@tailwindcss/browser");
            expect(result).toContain(
                "cdn.jsdelivr.net/npm/@tailwindcss/browser@4",
            );
            expect(result).toContain(
                '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>',
            );
        });

        it("includes Concierge Applet SDK script in output", () => {
            const content = "<div>Test applet</div>";
            const result = generateFilteredSandboxHtml(content, "light");

            expect(result).toContain('src="/applet-sdk.js"');
            expect(result).toContain('<script src="/applet-sdk.js"></script>');
        });

        it("can omit runtime scripts for component tests", () => {
            const content = "<div>Test applet</div>";
            const result = generateFilteredSandboxHtml(content, "light", {
                includeRuntimeScripts: false,
            });

            expect(result).not.toContain("@tailwindcss/browser");
            expect(result).not.toContain('src="/applet-sdk.js"');
            expect(result).toContain("Test applet");
        });

        it("includes user body content in output", () => {
            const content = '<div class="flex p-4">Test applet</div>';
            const result = generateFilteredSandboxHtml(content, "light");

            expect(result).toContain("Test applet");
            expect(result).toContain('class="flex p-4"');
        });

        it("keeps cross-origin fetches anonymous unless the applet opts into credentials", () => {
            const result = generateFilteredSandboxHtml(
                "<script>fetch('https://cdn.jsdelivr.net/data.json')</script>",
                "light",
            );

            expect(result).toContain(
                "const isSameOrigin = !!requestUrl && requestUrl.origin === window.location.origin;",
            );
            expect(result).toContain("if (isSameOrigin && !opts.credentials)");
            expect(result).toContain(
                "return window.__CONCIERGE_ORIGINAL_FETCH__.call(this, url, options ? opts : (isSameOrigin ? opts : undefined));",
            );
            expect(result).not.toContain("const originalFetch = window.fetch");
            expect(result).not.toContain("const opts = options || {};");
        });

        it("sets data-theme attribute from theme param", () => {
            const content = "<div>Content</div>";
            const lightResult = generateFilteredSandboxHtml(content, "light");
            const darkResult = generateFilteredSandboxHtml(content, "dark");

            expect(lightResult).toContain('data-theme="light"');
            expect(darkResult).toContain('data-theme="dark"');
        });

        it("sets lang and dir for Arabic locale", () => {
            const result = generateFilteredSandboxHtml(
                "<div>Content</div>",
                "light",
                {
                    language: "ar",
                },
            );

            expect(result).toContain('lang="ar"');
            expect(result).toContain('dir="rtl"');
            expect(result).toContain('window.CONCIERGE_LANGUAGE = "ar"');
            expect(result).toContain('window.CONCIERGE_DIRECTION = "rtl"');
        });

        it("injects APPLET_PARAMS from options.params", () => {
            const result = generateFilteredSandboxHtml(
                "<div>Content</div>",
                "light",
                {
                    params: { team: "team-alpha" },
                },
            );

            expect(result).toContain(
                'window.APPLET_PARAMS = {"team":"team-alpha"}',
            );
        });

        it("filters reserved and unsafe keys from options.params", () => {
            const result = generateFilteredSandboxHtml(
                "<div>Content</div>",
                "light",
                {
                    params: {
                        team: "team-alpha",
                        openChat: "123",
                        __proto__: "polluted",
                    },
                },
            );

            expect(result).toContain(
                'window.APPLET_PARAMS = {"team":"team-alpha"}',
            );
            expect(result).not.toContain("openChat");
            expect(result).not.toContain("__proto__");
        });

        it("includes locale-change listener alongside theme-change", () => {
            const result = generateFilteredSandboxHtml(
                "<div>Content</div>",
                "light",
                {
                    language: "en",
                },
            );

            expect(result).toContain("locale-change");
            expect(result).toContain("concierge-locale-change");
            expect(result).toContain("concierge-theme-change");
            expect(result).toContain("__conciergeIsTrustedParentMessage");
            expect(result).toContain("__conciergeNormalizeAppletLocale");
        });
    });
});
