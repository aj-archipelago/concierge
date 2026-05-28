import {
    deriveAppletMetadata,
    injectAppletIdMeta,
    deriveAppletName,
    injectAppletMetaTags,
    launchAppletGeneration,
    registerCanvasAppletFromWorkspaceFile,
} from "../appletGeneration";
import { uploadFileToMediaHelper } from "../fileUploadUtils";
import { createAppletGlobalStorageTarget } from "../storageTargets";

jest.mock("../fileUploadUtils", () => ({
    uploadFileToMediaHelper: jest.fn(),
}));

jest.mock("../storageTargets", () => ({
    createAppletGlobalStorageTarget: jest.fn((userContextId) => ({
        kind: "applet-global",
        userContextId,
    })),
}));

describe("appletGeneration helpers", () => {
    test("derives a concise applet name from the prompt subject", () => {
        expect(
            deriveAppletName(
                "Create a landing page for a coffee shop with a menu and contact form",
            ),
        ).toBe("Coffee Shop");
    });

    test("falls back to a generated name when the prompt is empty", () => {
        expect(deriveAppletName("")).toBe("Generated Applet");
    });

    test("derives a stable filename from the applet name", () => {
        expect(deriveAppletMetadata("A task tracker app")).toEqual({
            appletName: "Task Tracker",
            filename: "task-tracker.html",
        });
    });

    test("injects applet meta tags once", () => {
        const html =
            "<html><head></head><body><main>Hello</main></body></html>";

        const tagged = injectAppletMetaTags(html, "Task Tracker");

        expect(tagged).toContain(
            '<meta name="concierge-type" content="applet">',
        );
        expect(tagged).toContain(
            '<meta name="applet-name" content="Task Tracker">',
        );

        const taggedAgain = injectAppletMetaTags(tagged, "Task Tracker");
        expect(taggedAgain.match(/concierge-type/g)).toHaveLength(1);
        expect(taggedAgain.match(/applet-name/g)).toHaveLength(1);
    });

    test("injects the applet id meta tag once", () => {
        const html =
            '<html><head><meta name="concierge-type" content="applet"></head><body></body></html>';

        const tagged = injectAppletIdMeta(html, "applet-123");
        expect(tagged).toContain(
            '<meta name="applet-id" content="applet-123">',
        );

        const taggedAgain = injectAppletIdMeta(tagged, "applet-456");
        expect(taggedAgain).toContain(
            '<meta name="applet-id" content="applet-456">',
        );
        expect(taggedAgain.match(/applet-id/g)).toHaveLength(1);
    });

    test("registers an existing workspace html file as a new applet", async () => {
        uploadFileToMediaHelper.mockResolvedValue({
            url: "https://files.example/applets/weather.html",
            hash: "hash-registered",
        });

        global.fetch = jest
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                text: async () =>
                    "<html><head></head><body><main>Hello</main></body></html>",
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ _id: "applet-123", name: "Weather App" }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ _id: "applet-123", name: "Weather App" }),
            });

        const result = await registerCanvasAppletFromWorkspaceFile({
            workspacePath: "/workspace/files/applets/weather.html",
            appletName: "Weather App",
            userContextId: "ctx",
        });

        expect(result.appletId).toBe("applet-123");
        expect(result.appletName).toBe("Weather App");
        expect(result.filename).toBe("weather.html");
        expect(result.html).toContain(
            '<meta name="applet-id" content="applet-123">',
        );
        expect(global.fetch.mock.calls[0][0]).toBe(
            "/api/workspace/file?path=%2Fworkspace%2Ffiles%2Fapplets%2Fweather.html",
        );
        expect(global.fetch.mock.calls[1][0]).toBe("/api/canvas-applets");
        expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toMatchObject({
            name: "Weather App",
            workspacePath: "/workspace/files/applets/weather.html",
        });
        expect(global.fetch.mock.calls[2][0]).toBe(
            "/api/canvas-applets/applet-123",
        );
        expect(JSON.parse(global.fetch.mock.calls[2][1].body)).toMatchObject({
            workspacePath: "/workspace/files/applets/weather.html",
            filePath: "https://files.example/applets/weather.html",
        });
        expect(createAppletGlobalStorageTarget).toHaveBeenCalledWith("ctx");
        expect(uploadFileToMediaHelper).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "weather.html",
                type: "text/html",
            }),
            expect.objectContaining({
                storageTarget: {
                    kind: "applet-global",
                    userContextId: "ctx",
                },
                checkHash: false,
                subPath: null,
            }),
        );
    });

    test("marks the canvas tab as errored when generation startup fails", async () => {
        const dispatch = jest.fn();
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            json: async () => ({ error: "Cortex returned 500" }),
        });

        const { completion } = launchAppletGeneration({
            prompt: "Build a timer",
            dispatch,
            tabId: "tab-1",
        });

        await expect(completion).rejects.toThrow("Cortex returned 500");
        expect(dispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                payload: expect.objectContaining({
                    tabId: "tab-1",
                    content: {
                        htmlStatus: "error",
                        htmlError: "Cortex returned 500",
                    },
                }),
            }),
        );
    });
});
