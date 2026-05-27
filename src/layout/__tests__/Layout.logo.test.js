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

    it("redirects the app default route to a new chat", () => {
        const src = fs.readFileSync(
            path.join(repoRoot, "next.config.js"),
            "utf8",
        );
        const redirectsBlock = src.slice(
            src.indexOf("const redirects = ["),
            src.indexOf("const anonymizeUrl"),
        );

        expect(redirectsBlock).toContain('source: "/"');
        expect(redirectsBlock).toContain('destination: "/chat/new"');
        expect(redirectsBlock).not.toContain('destination: "/home"');
    });
});
