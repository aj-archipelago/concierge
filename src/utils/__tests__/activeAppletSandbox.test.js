/**
 * @jest-environment jsdom
 */

import {
    clearActiveAppletSandbox,
    setActiveAppletSandbox,
    waitForActiveAppletDocument,
} from "../activeAppletSandbox";

describe("waitForActiveAppletDocument", () => {
    afterEach(() => {
        clearActiveAppletSandbox();
    });

    test("waits for a remounted iframe instead of failing immediately", async () => {
        const iframe = document.createElement("iframe");
        iframe.src = "about:blank";
        document.body.appendChild(iframe);

        const waitPromise = waitForActiveAppletDocument({ timeoutMs: 500 });
        setTimeout(() => {
            setActiveAppletSandbox("applet-1", iframe);
        }, 60);

        const doc = await waitPromise;
        expect(doc).toBe(iframe.contentDocument);
    });

    test("throws the existing missing-canvas error after timeout", async () => {
        await expect(
            waitForActiveAppletDocument({ timeoutMs: 80 }),
        ).rejects.toThrow(/No applet is currently open/);
    });
});
