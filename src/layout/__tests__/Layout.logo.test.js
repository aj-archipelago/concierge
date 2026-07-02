const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");

describe("Layout logo navigation", () => {
    it("uses the app default route for the header logo", () => {
        const src = fs.readFileSync(
            path.join(repoRoot, "src/layout/Layout.js"),
            "utf8",
        );
        const logoLinkBlock = src.slice(
            src.indexOf(
                'className="flex min-w-0 items-center gap-2.5 leading-tight"',
            ),
            src.indexOf("src={getLogo(language, theme)}"),
        );

        expect(logoLinkBlock).toContain('href="/"');
        expect(logoLinkBlock).not.toContain('href="/chat"');
    });

    it("redirects the app default route to home", () => {
        const src = fs.readFileSync(
            path.join(repoRoot, "next.config.js"),
            "utf8",
        );
        const redirectsBlock = src.slice(
            src.indexOf("const redirects = ["),
            src.indexOf("const anonymizeUrl"),
        );

        expect(redirectsBlock).toContain('source: "/"');
        expect(redirectsBlock).toContain('destination: "/home"');
        expect(redirectsBlock).not.toContain('destination: "/chat/new"');
        expect(redirectsBlock).toContain("permanent: false");
    });

    it("keeps transient sidebar hover expansion from resizing the main pane", () => {
        const src = fs.readFileSync(
            path.join(repoRoot, "src/layout/Layout.js"),
            "utf8",
        );

        expect(src).toContain("const isSidebarVisuallyExpanded =");
        expect(src).toContain(
            "const shouldReserveExpandedSidebar = !isCollapsed;",
        );
        expect(src).toContain(
            'isSidebarVisuallyExpanded ? "lg:w-56" : "lg:w-16"',
        );
        expect(src).toMatch(
            /shouldReserveExpandedSidebar\s*\?\s*"lg:ps-56"\s*:\s*"lg:ps-16"/,
        );
        expect(src).toContain("onInteractionExpandedChange={");
        expect(src).toContain("setSidebarInteractionExpanded");
    });

    it("lets published applet embed URLs bypass the app shell", () => {
        const src = fs.readFileSync(
            path.join(repoRoot, "src/layout/Layout.js"),
            "utf8",
        );

        expect(src).toContain("shouldRenderAppletWithoutChrome");
        expect(src).toContain("shouldRenderChromeFreeApplet");
        expect(src).toContain("if (shouldRenderChromeFreeApplet)");
        expect(src).toContain("!shouldRenderChromeFreeApplet &&");
        expect(src).toContain("h-screen min-h-screen w-full");
    });
});
