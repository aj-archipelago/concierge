/**
 * @jest-environment jsdom
 */
import {
    handleGetCanvasState,
    getInspectScreenshotScale,
    handleInspectCanvas,
} from "../canvasTools";

describe("InspectCanvas", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = "";
        global.fetch = jest.fn();
    });

    test("reports empty canvas when no active tab element exists", async () => {
        const result = await handleInspectCanvas(
            { toolArgs: { userMessage: "Show me", includeScreenshot: false } },
            {
                getActiveTabId: () => null,
                getActiveTabContent: () => ({}),
                getEntityId: () => null,
            },
        );

        expect(result.success).toBe(true);
        expect(result.data.contentType).toBe("empty");
        expect(result.data.description).toContain("empty");
    });

    test("discriminates article content type", async () => {
        const tab = document.createElement("div");
        tab.setAttribute("data-tab-id", "tab-article");
        document.body.appendChild(tab);

        const result = await handleInspectCanvas(
            {
                toolArgs: {
                    userMessage: "Inspect article",
                    includeScreenshot: false,
                },
            },
            {
                getActiveTabId: () => "tab-article",
                getActiveTabContent: () => ({
                    type: "article",
                    title: "My Article",
                    workspacePath: "/workspace/files/articles/a.json",
                }),
                getEntityId: () => "entity1",
            },
        );

        expect(result.success).toBe(true);
        expect(result.data.contentType).toBe("article");
        expect(result.data.current.title).toBe("My Article");
        expect(result.data.description).toContain("Article");
    });

    test("discriminates applet content type and reports staleness", async () => {
        const tab = document.createElement("div");
        tab.setAttribute("data-tab-id", "tab-applet");
        const iframe = document.createElement("iframe");
        tab.appendChild(iframe);
        document.body.appendChild(tab);

        // Mock contentWindow with postMessage that immediately replies with the
        // expected inspect-response shape so the handler resolves without timing out.
        const fakeWindow = {
            close: jest.fn(),
            postMessage: jest.fn((msg) => {
                if (msg.type !== "__APPLET_INSPECT_REQUEST__") return;
                setTimeout(() => {
                    window.dispatchEvent(
                        new MessageEvent("message", {
                            data: {
                                type: "__APPLET_INSPECT_RESPONSE__",
                                requestId: msg.requestId,
                                data: {
                                    consoleEntries: [],
                                    networkRequests: [],
                                },
                            },
                            source: fakeWindow,
                        }),
                    );
                }, 0);
            }),
        };
        Object.defineProperty(iframe, "contentWindow", {
            value: fakeWindow,
            writable: true,
        });

        // Workspace file content differs from canvas's loaded htmlContent → stale
        global.fetch.mockResolvedValueOnce({
            ok: true,
            text: async () => "<html>workspace edited</html>",
        });

        const result = await handleInspectCanvas(
            {
                toolArgs: {
                    userMessage: "Inspect applet",
                    includeScreenshot: false,
                },
            },
            {
                getActiveTabId: () => "tab-applet",
                getActiveTabContent: () => ({
                    type: "html",
                    appletId: "applet123",
                    title: "Weather Applet",
                    workspacePath: "/workspace/files/weather.html",
                    htmlContent: "<html>preview</html>",
                }),
                getEntityId: () => "entity1",
            },
        );

        expect(result.success).toBe(true);
        expect(result.data.contentType).toBe("applet");
        expect(result.data.current.id).toBe("applet123");
        expect(result.data.isStale).toBe(true);
        expect(result.data.description).toContain("refresh bug");
    }, 10000);

    test("hydrates missing applet workspacePath from the registry", async () => {
        const tab = document.createElement("div");
        tab.setAttribute("data-tab-id", "tab-applet");
        document.body.appendChild(tab);
        const dispatch = jest.fn();

        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                _id: "applet123",
                name: "Weather Applet",
                workspacePath: "/workspace/files/applets/weather.html",
                filePath: "https://files.example/applets/weather.html",
                fileHash: "hash123",
                fileBlobPath: "applets/weather.html",
            }),
        });

        const result = await handleInspectCanvas(
            {
                toolArgs: {
                    userMessage: "Inspect applet",
                    includeScreenshot: false,
                },
            },
            {
                dispatch,
                getActiveTabId: () => "tab-applet",
                getActiveTabContent: () => ({
                    type: "html",
                    appletId: "applet123",
                    title: "Weather Applet",
                    workspacePath: null,
                    htmlContent: null,
                }),
                getEntityId: () => "entity1",
            },
        );

        expect(result.success).toBe(true);
        expect(result.data.contentType).toBe("applet");
        expect(result.data.current.workspacePath).toBe(
            "/workspace/files/applets/weather.html",
        );
        expect(dispatch).toHaveBeenCalledWith({
            type: "chat/updateCanvasTab",
            payload: {
                tabId: "tab-applet",
                content: expect.objectContaining({
                    appletId: "applet123",
                    workspacePath: "/workspace/files/applets/weather.html",
                    blobPath: "applets/weather.html",
                }),
            },
        });
    });

    test("scales tall screenshots under model image limits", () => {
        const scale = getInspectScreenshotScale(1200, 12000);

        expect(scale).toBeLessThan(1);
        expect(Math.floor(1200 * scale)).toBeLessThanOrEqual(1600);
        expect(Math.floor(12000 * scale)).toBeLessThanOrEqual(1600);
        expect(
            Math.floor(1200 * scale) * Math.floor(12000 * scale),
        ).toBeLessThanOrEqual(1_000_000);
    });

    test("keeps high-detail screenshots under the hard image limit", () => {
        const scale = getInspectScreenshotScale(2400, 2400, "high");

        expect(Math.floor(2400 * scale)).toBeLessThanOrEqual(1600);
        expect(
            Math.floor(2400 * scale) * Math.floor(2400 * scale),
        ).toBeLessThanOrEqual(1_000_000);
    });
});

describe("GetCanvasState", () => {
    test("returns lightweight applet identity without screenshot inspection", async () => {
        const result = await handleGetCanvasState(
            { toolArgs: { userMessage: "Check canvas" } },
            {
                getActiveTabId: () => "tab-applet",
                getActiveTabContent: () => ({
                    type: "html",
                    title: "Weather Applet",
                    appletId: "applet123",
                    workspacePath: "/workspace/files/applets/weather.html",
                    blobPath: "applets/weather.html",
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(result.data.contentType).toBe("applet");
        expect(result.data.current.appletId).toBe("applet123");
        expect(result.data.current.workspacePath).toBe(
            "/workspace/files/applets/weather.html",
        );
        expect(result.data.description).toContain("applet");
    });
});
