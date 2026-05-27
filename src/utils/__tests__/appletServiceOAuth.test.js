import "../../i18n";
import { runAppletServiceOAuth } from "../appletServiceOAuth";

describe("runAppletServiceOAuth", () => {
    let openSpy;

    beforeEach(() => {
        Object.defineProperty(window, "location", {
            value: {
                ...window.location,
                origin: "http://localhost",
            },
            writable: true,
        });
        openSpy = jest.spyOn(window, "open").mockImplementation(() => ({
            closed: false,
        }));
    });

    afterEach(() => {
        openSpy.mockRestore();
    });

    it("rejects when connectInfo is missing service", async () => {
        await expect(runAppletServiceOAuth({})).rejects.toThrow(
            "connectInfo.service is required",
        );
    });

    it("opens oauthUrl and resolves on success postMessage from popup", async () => {
        const popup = { closed: false };
        openSpy.mockReturnValue(popup);

        const p = runAppletServiceOAuth({
            service: "slack",
            oauthUrl: "/api/auth/slack",
        });

        await Promise.resolve();

        expect(openSpy).toHaveBeenCalledWith(
            `${window.location.origin}/api/auth/slack`,
            "concierge-applet-service-oauth",
            expect.stringMatching(/^width=/),
        );

        window.dispatchEvent(
            new MessageEvent("message", {
                origin: window.location.origin,
                source: popup,
                data: { type: "slack-oauth-complete", success: true },
            }),
        );

        await expect(p).resolves.toBeUndefined();
    });
});
