import {
    isAppletEmbedMode,
    isAppletRuntimePath,
    shouldRenderAppletWithoutChrome,
} from "../appletChrome";

describe("applet chrome helpers", () => {
    it("detects applet runtime routes", () => {
        expect(isAppletRuntimePath("/apps/forecast")).toBe(true);
        expect(isAppletRuntimePath("/apps/private/applet-123")).toBe(true);
        expect(isAppletRuntimePath("/published/applets/applet-123")).toBe(true);
        expect(
            isAppletRuntimePath("/published/workspaces/workspace-123/applet"),
        ).toBe(true);

        expect(isAppletRuntimePath("/apps")).toBe(false);
        expect(isAppletRuntimePath("/apps/forecast/settings")).toBe(false);
        expect(isAppletRuntimePath("/chat")).toBe(false);
    });

    it("enables embed mode with the public embed parameter", () => {
        expect(isAppletEmbedMode(new URLSearchParams("embed=true"))).toBe(true);
        expect(isAppletEmbedMode(new URLSearchParams("embed=1"))).toBe(true);
        expect(isAppletEmbedMode(new URLSearchParams("embed=yes"))).toBe(true);
        expect(isAppletEmbedMode(new URLSearchParams("embed=false"))).toBe(
            false,
        );
    });

    it("also accepts chrome=0 as a no-chrome alias", () => {
        expect(isAppletEmbedMode(new URLSearchParams("chrome=0"))).toBe(true);
        expect(isAppletEmbedMode(new URLSearchParams("chrome=false"))).toBe(
            true,
        );
        expect(isAppletEmbedMode(new URLSearchParams("chrome=true"))).toBe(
            false,
        );
    });

    it("only hides the app shell when embed mode is used on an applet route", () => {
        expect(
            shouldRenderAppletWithoutChrome(
                "/apps/forecast",
                new URLSearchParams("embed=true"),
            ),
        ).toBe(true);
        expect(
            shouldRenderAppletWithoutChrome(
                "/published/applets/applet-123",
                new URLSearchParams("chrome=0"),
            ),
        ).toBe(true);

        expect(
            shouldRenderAppletWithoutChrome(
                "/apps/forecast",
                new URLSearchParams("embed=false"),
            ),
        ).toBe(false);
        expect(
            shouldRenderAppletWithoutChrome(
                "/chat",
                new URLSearchParams("embed=true"),
            ),
        ).toBe(false);
    });
});
