/**
 * @jest-environment jsdom
 */

import { registerCanvasAppletFromWorkspaceFile } from "../appletGeneration";
import { uploadFileToMediaHelper } from "../fileUploadUtils";
import {
    CLIENT_SIDE_TOOLS,
    CLIENT_SIDE_TOOL_HANDLERS,
    resolveCanvasAppletForFile,
} from "../clientSideTools";

const VALID_PNG_DATA_URL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

jest.mock("../appletGeneration", () => ({
    launchAppletGeneration: jest.fn(),
    registerCanvasAppletFromWorkspaceFile: jest.fn(),
}));

jest.mock("../fileUploadUtils", () => ({
    uploadFileToMediaHelper: jest.fn(),
}));

jest.mock("../activeAppletSandbox", () => ({
    getActiveAppletSandbox: jest.fn(),
    requireActiveAppletDocument: jest.fn(),
    inspectApplet: jest.fn(),
}));

const {
    getActiveAppletSandbox: mockGetActiveAppletSandbox,
    requireActiveAppletDocument: mockRequireActiveAppletDocument,
    inspectApplet: mockInspectApplet,
} = jest.requireMock("../activeAppletSandbox");

describe("clientSideTools SubmitFeedback", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                feedbackId: "feedback-1",
            }),
        });
    });

    test("is exposed as an always-available global client tool", () => {
        const submitFeedback = CLIENT_SIDE_TOOLS.find(
            (tool) => tool.function?.name === "SubmitFeedback",
        );

        expect(submitFeedback).toBeTruthy();
        expect(submitFeedback.function.parameters.required).toContain(
            "message",
        );
        expect(
            submitFeedback.function.parameters.properties.imageUrl,
        ).toBeTruthy();
        expect(
            submitFeedback.function.parameters.properties.includeScreenshot,
        ).toBeUndefined();
    });

    test("submits agent feedback through the feedback API", async () => {
        const result = await CLIENT_SIDE_TOOL_HANDLERS.submitfeedback({
            toolArgs: {
                message: "The user got stuck finding the upload control.",
                category: "question",
            },
        });

        expect(result.success).toBe(true);
        expect(result.data.feedbackId).toBe("feedback-1");
        expect(global.fetch).toHaveBeenCalledWith(
            "/api/feedback",
            expect.objectContaining({
                method: "POST",
                body: expect.any(String),
            }),
        );
        expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({
            message: "The user got stuck finding the upload control.",
            category: "question",
            source: "agent",
        });
    });

    test("uploads an image data URL before submitting feedback", async () => {
        uploadFileToMediaHelper.mockResolvedValue({
            url: "https://files.test/feedback.png",
        });

        const result = await CLIENT_SIDE_TOOL_HANDLERS.submitfeedback(
            {
                toolArgs: {
                    message: "The visual state looks broken.",
                    imageDataUrl: VALID_PNG_DATA_URL,
                },
            },
            {
                user: { contextId: "user-1" },
                serverUrl: "https://concierge.test",
            },
        );

        expect(result.success).toBe(true);
        expect(uploadFileToMediaHelper).toHaveBeenCalledWith(
            expect.any(File),
            expect.objectContaining({
                checkHash: false,
                serverUrl: "https://concierge.test/media-helper",
            }),
        );
        expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({
            message: "The visual state looks broken.",
            screenshot: "https://files.test/feedback.png",
            source: "agent",
        });
    });

    test("reports success when the feedback row is saved", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                success: true,
                feedbackId: "feedback-2",
            }),
        });

        const result = await CLIENT_SIDE_TOOL_HANDLERS.submitfeedback({
            toolArgs: {
                message: "The image notification failed.",
                imageUrl: "https://files.test/feedback.png",
            },
        });

        expect(result.success).toBe(true);
        expect(result.data.feedbackId).toBe("feedback-2");
    });
});

describe("clientSideTools OpenInCanvas", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    test("resolves a registered applet by blobPath", async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                applets: [
                    {
                        _id: "applet-123",
                        name: "Weather App",
                        fileHash: "hash-123",
                        fileBlobPath: "applets/weather.html",
                        workspacePath: "/workspace/files/applets/weather.html",
                    },
                ],
            }),
        });

        const applet = await resolveCanvasAppletForFile({
            fileHash: "other",
            blobPath: "applets/weather.html",
            filename: "weather.html",
        });

        expect(applet?._id).toBe("applet-123");
        expect(global.fetch).toHaveBeenCalledWith("/api/canvas-applets");
    });

    test("opens registered HTML files with applet identity and workspace path", async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                applets: [
                    {
                        _id: "applet-123",
                        name: "Weather App",
                        fileHash: "hash-123",
                        fileBlobPath: "applets/weather.html",
                        workspacePath: "/workspace/files/applets/weather.html",
                    },
                ],
            }),
        });
        const dispatch = jest.fn();

        const result = await CLIENT_SIDE_TOOL_HANDLERS.openincanvas(
            {
                toolArgs: {
                    fileHash: "hash-123",
                    blobPath: "applets/weather.html",
                    url: "https://files.example/weather.html",
                    mimeType: "text/html",
                    filename: "weather.html",
                },
            },
            { dispatch },
        );

        await Promise.resolve();

        expect(result.success).toBe(true);
        expect(dispatch).toHaveBeenCalledWith({
            type: "chat/openCanvas",
            payload: expect.objectContaining({
                type: "html",
                title: "Weather App",
                filename: "weather.html",
                appletId: "applet-123",
                workspacePath: "/workspace/files/applets/weather.html",
                canvasChrome: undefined,
            }),
        });
    });

    test("opens registered applets from workspace fileRef without requiring URL args", async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                applets: [
                    {
                        _id: "applet-123",
                        name: "Weather App",
                        fileBlobPath: "applets/weather.html",
                        filePath: "https://files.example/weather.html",
                        workspacePath: "/workspace/files/applets/weather.html",
                    },
                ],
            }),
        });
        const dispatch = jest.fn();

        const result = await CLIENT_SIDE_TOOL_HANDLERS.openincanvas(
            {
                toolArgs: {
                    fileRef: "/workspace/files/applets/weather.html",
                },
            },
            { dispatch },
        );

        await Promise.resolve();

        expect(result.success).toBe(true);
        expect(registerCanvasAppletFromWorkspaceFile).not.toHaveBeenCalled();
        expect(dispatch).toHaveBeenCalledWith({
            type: "chat/openCanvas",
            payload: expect.objectContaining({
                type: "html",
                title: "Weather App",
                filename: "weather.html",
                appletId: "applet-123",
                url: "https://files.example/weather.html",
                workspacePath: "/workspace/files/applets/weather.html",
            }),
        });
    });

    test("registers and opens an applet workspace file when metadata is missing", async () => {
        global.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ applets: [] }),
        });
        registerCanvasAppletFromWorkspaceFile.mockResolvedValue({
            appletId: "applet-new",
            appletName: "Simon Game",
            filename: "simon-game.html",
            workspacePath: "/workspace/files/applets/simon-game.html",
            html: "<html><body>Simon</body></html>",
            applet: {
                filePath: "https://files.example/applets/simon-game.html",
            },
        });
        const dispatch = jest.fn();

        const result = await CLIENT_SIDE_TOOL_HANDLERS.openincanvas(
            {
                toolArgs: {
                    fileRef: "/workspace/files/applets/simon-game.html",
                },
            },
            {
                dispatch,
                user: { contextId: "user-123" },
            },
        );

        await Promise.resolve();

        expect(result.success).toBe(true);
        expect(registerCanvasAppletFromWorkspaceFile).toHaveBeenCalledWith({
            workspacePath: "/workspace/files/applets/simon-game.html",
            appletName: undefined,
            userContextId: "user-123",
        });
        expect(dispatch).toHaveBeenCalledWith({
            type: "chat/openCanvas",
            payload: expect.objectContaining({
                type: "html",
                title: "Simon Game",
                filename: "simon-game.html",
                appletId: "applet-new",
                workspacePath: "/workspace/files/applets/simon-game.html",
                htmlContent: "<html><body>Simon</body></html>",
                canvasChrome: undefined,
            }),
        });
    });

    test("opens generic workspace HTML in hidden-chrome mode by default", async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ applets: [] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => "<html><body>Generic</body></html>",
            });
        const dispatch = jest.fn();

        const result = await CLIENT_SIDE_TOOL_HANDLERS.openincanvas(
            {
                toolArgs: {
                    fileRef: "/workspace/files/global/report.html",
                },
            },
            { dispatch },
        );

        await Promise.resolve();

        expect(result.success).toBe(true);
        expect(dispatch).toHaveBeenCalledWith({
            type: "chat/openCanvas",
            payload: expect.objectContaining({
                type: "html",
                title: "report.html",
                filename: "report.html",
                workspacePath: "/workspace/files/global/report.html",
                htmlContent: "<html><body>Generic</body></html>",
                appletId: null,
                canvasChrome: "hidden",
            }),
        });
    });

    test("can open generic HTML with normal canvas chrome when requested", async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ applets: [] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => "<html><body>Report</body></html>",
            });
        const dispatch = jest.fn();

        const result = await CLIENT_SIDE_TOOL_HANDLERS.openincanvas(
            {
                toolArgs: {
                    fileRef: "/workspace/files/global/report.html",
                    hideCanvasChrome: false,
                },
            },
            { dispatch },
        );

        await Promise.resolve();

        expect(result.success).toBe(true);
        expect(dispatch).toHaveBeenCalledWith({
            type: "chat/openCanvas",
            payload: expect.objectContaining({
                type: "html",
                appletId: null,
                canvasChrome: undefined,
            }),
        });
    });

    test("ignores hidden-chrome mode for applet HTML", async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                applets: [
                    {
                        _id: "applet-123",
                        name: "Weather App",
                        fileBlobPath: "applets/weather.html",
                        filePath: "https://files.example/weather.html",
                        workspacePath: "/workspace/files/applets/weather.html",
                    },
                ],
            }),
        });
        const dispatch = jest.fn();

        const result = await CLIENT_SIDE_TOOL_HANDLERS.openincanvas(
            {
                toolArgs: {
                    fileRef: "/workspace/files/applets/weather.html",
                    hideCanvasChrome: true,
                },
            },
            { dispatch },
        );

        await Promise.resolve();

        expect(result.success).toBe(true);
        expect(dispatch).toHaveBeenCalledWith({
            type: "chat/openCanvas",
            payload: expect.objectContaining({
                type: "html",
                appletId: "applet-123",
                canvasChrome: undefined,
            }),
        });
    });
});

describe("clientSideTools CreateApplet", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    test("requires explicit confirmation before creating a new applet over an active one", async () => {
        const dispatch = jest.fn();

        const result = await CLIENT_SIDE_TOOL_HANDLERS.createapplet(
            {
                toolArgs: {
                    prompt: "Make this timer blue",
                    userMessage: "Updating the applet",
                },
            },
            {
                dispatch,
                getActiveHtmlContent: () => ({
                    type: "html",
                    appletId: "applet-123",
                    workspacePath: "/workspace/files/applets/timer.html",
                }),
            },
        );

        expect(result.success).toBe(true);
        expect(result.data.requiresConfirmation).toBe(true);
        expect(result.data.description).toContain(
            "CreateApplet creates a separate new applet",
        );
        expect(result.data.description).toContain(
            "/workspace/files/applets/timer.html",
        );
        expect(dispatch).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test("documents createNew confirmation in the tool schema", () => {
        const generateApplet = CLIENT_SIDE_TOOLS.find(
            (tool) => tool.function?.name === "CreateApplet",
        );

        expect(
            generateApplet.function.parameters.properties.createNew.description,
        ).toContain("separate new applet");
    });
});

describe("clientSideTools applet driver", () => {
    // The handlers reach into the applet iframe via the activeAppletSandbox
    // module. In the unit-test environment there is no iframe, so we mock
    // that module and hand the handlers the jest jsdom document directly.
    let appletDoc;

    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = "";
        appletDoc = document;
        mockRequireActiveAppletDocument.mockImplementation(() => appletDoc);
        mockGetActiveAppletSandbox.mockReturnValue({
            appletId: "applet-1",
            iframe: { contentWindow: window, isConnected: true },
        });
    });

    describe("ClickAppletElement", () => {
        test("clicks the first match and reports it", async () => {
            document.body.innerHTML = `
                <button id="a">Cancel</button>
                <button id="b">Save</button>
            `;
            const clicked = jest.fn();
            document.getElementById("b").addEventListener("click", clicked);

            const result = await CLIENT_SIDE_TOOL_HANDLERS.clickappletelement({
                toolArgs: {
                    selector: "button",
                    text: "save",
                    userMessage: "Trying save",
                },
            });

            expect(clicked).toHaveBeenCalledTimes(1);
            expect(result.success).toBe(true);
            expect(result.data.matchedCount).toBe(2);
            expect(result.data.clicked.tag).toBe("button");
            expect(result.data.clicked.text).toBe("Save");
        });

        test("picks by 0-based nth when text is omitted", async () => {
            document.body.innerHTML = `
                <button class="x">A</button>
                <button class="x">B</button>
                <button class="x">C</button>
            `;
            const clicked = jest.fn();
            document
                .querySelectorAll("button")[2]
                .addEventListener("click", clicked);

            const result = await CLIENT_SIDE_TOOL_HANDLERS.clickappletelement({
                toolArgs: {
                    selector: "button.x",
                    nth: 2,
                    userMessage: "Click the third",
                },
            });

            expect(clicked).toHaveBeenCalledTimes(1);
            expect(result.data.clicked.text).toBe("C");
        });

        test("refuses to click a disabled element", async () => {
            document.body.innerHTML = `<button disabled>Submit</button>`;
            await expect(
                CLIENT_SIDE_TOOL_HANDLERS.clickappletelement({
                    toolArgs: { selector: "button", userMessage: "x" },
                }),
            ).rejects.toThrow(/disabled/);
        });

        test("rejects when nothing matches the selector", async () => {
            await expect(
                CLIENT_SIDE_TOOL_HANDLERS.clickappletelement({
                    toolArgs: { selector: ".missing", userMessage: "x" },
                }),
            ).rejects.toThrow(/No elements matched/);
        });
    });

    describe("FillAppletField", () => {
        test("sets an input value and dispatches input+change", async () => {
            document.body.innerHTML = `<input id="email" type="text" />`;
            const input = document.getElementById("email");
            const events = [];
            input.addEventListener("input", () => events.push("input"));
            input.addEventListener("change", () => events.push("change"));

            const result = await CLIENT_SIDE_TOOL_HANDLERS.fillappletfield({
                toolArgs: {
                    selector: "input#email",
                    value: "a@b.com",
                    userMessage: "fill email",
                },
            });

            expect(input.value).toBe("a@b.com");
            expect(events).toEqual(["input", "change"]);
            expect(result.data.set.value).toBe("a@b.com");
            expect(result.data.submitted).toBe(false);
        });

        test("toggles a checkbox via boolean-string value", async () => {
            document.body.innerHTML = `<input id="agree" type="checkbox" />`;
            const cb = document.getElementById("agree");

            await CLIENT_SIDE_TOOL_HANDLERS.fillappletfield({
                toolArgs: {
                    selector: "#agree",
                    value: "true",
                    userMessage: "check it",
                },
            });

            expect(cb.checked).toBe(true);
        });

        test("submits the form when submit:true", async () => {
            document.body.innerHTML = `
                <form id="f"><input name="q" /><button type="submit">Go</button></form>
            `;
            const form = document.getElementById("f");
            const submitted = jest.fn((e) => e.preventDefault());
            form.addEventListener("submit", submitted);

            const result = await CLIENT_SIDE_TOOL_HANDLERS.fillappletfield({
                toolArgs: {
                    selector: "input[name='q']",
                    value: "hi",
                    submit: true,
                    userMessage: "search",
                },
            });

            expect(result.data.submitted).toBe(true);
            expect(submitted).toHaveBeenCalled();
        });

        test("rejects when the target is not fillable", async () => {
            document.body.innerHTML = `<div id="x">hi</div>`;
            await expect(
                CLIENT_SIDE_TOOL_HANDLERS.fillappletfield({
                    toolArgs: {
                        selector: "#x",
                        value: "y",
                        userMessage: "z",
                    },
                }),
            ).rejects.toThrow(/not a fillable field/);
        });
    });

    describe("QueryAppletDom", () => {
        test("returns descriptors for matched elements", async () => {
            document.body.innerHTML = `
                <button id="a" data-testid="primary">Save</button>
                <button id="b">Cancel</button>
                <button id="c">Delete</button>
            `;

            const result = await CLIENT_SIDE_TOOL_HANDLERS.queryappletdom({
                toolArgs: {
                    selector: "button",
                    userMessage: "look at buttons",
                },
            });

            expect(result.data.matchedCount).toBe(3);
            expect(result.data.returnedCount).toBe(3);
            expect(result.data.matches[0].attrs.id).toBe("a");
            expect(result.data.matches[0].attrs["data-testid"]).toBe("primary");
            expect(result.data.matches[0].text).toBe("Save");
        });

        test("caps results at limit (max 50, default 10)", async () => {
            document.body.innerHTML = Array.from({ length: 25 })
                .map((_, i) => `<span class="row">r${i}</span>`)
                .join("");

            const defaultResult =
                await CLIENT_SIDE_TOOL_HANDLERS.queryappletdom({
                    toolArgs: {
                        selector: ".row",
                        userMessage: "count rows",
                    },
                });
            expect(defaultResult.data.matchedCount).toBe(25);
            expect(defaultResult.data.returnedCount).toBe(10);

            const explicit = await CLIENT_SIDE_TOOL_HANDLERS.queryappletdom({
                toolArgs: {
                    selector: ".row",
                    limit: 5,
                    userMessage: "limit to 5",
                },
            });
            expect(explicit.data.returnedCount).toBe(5);
        });

        test("redacts password field values and any value attribute", async () => {
            document.body.innerHTML = `
                <input id="p" type="password" value="hunter2" />
            `;
            document.getElementById("p").value = "hunter2";

            const result = await CLIENT_SIDE_TOOL_HANDLERS.queryappletdom({
                toolArgs: {
                    selector: "input#p",
                    userMessage: "x",
                },
            });

            const match = result.data.matches[0];
            expect(match.value).toBe("[redacted]");
            expect(match.sensitive).toBe(true);
            expect(match.attrs.value).toBe("[redacted]");
        });

        test("redacts fields with sensitive autocomplete", async () => {
            document.body.innerHTML = `
                <input id="otp" type="text" autocomplete="one-time-code" />
            `;
            document.getElementById("otp").value = "123456";

            const result = await CLIENT_SIDE_TOOL_HANDLERS.queryappletdom({
                toolArgs: {
                    selector: "input#otp",
                    userMessage: "x",
                },
            });

            expect(result.data.matches[0].value).toBe("[redacted]");
            expect(result.data.matches[0].sensitive).toBe(true);
        });

        test("rejects invalid CSS selector", async () => {
            await expect(
                CLIENT_SIDE_TOOL_HANDLERS.queryappletdom({
                    toolArgs: {
                        selector: "::::not a selector",
                        userMessage: "x",
                    },
                }),
            ).rejects.toThrow(/Invalid CSS selector/);
        });
    });

    describe("WaitForAppletElement", () => {
        test("resolves immediately when the selector already matches", async () => {
            document.body.innerHTML = `<div id="ready">hi</div>`;
            const result = await CLIENT_SIDE_TOOL_HANDLERS.waitforappletelement(
                {
                    toolArgs: { selector: "#ready", userMessage: "x" },
                },
            );
            expect(result.data.matchedCount).toBe(1);
            expect(result.data.waitedMs).toBeGreaterThanOrEqual(0);
        });

        test("resolves once the element appears", async () => {
            const promise = CLIENT_SIDE_TOOL_HANDLERS.waitforappletelement({
                toolArgs: {
                    selector: "#late",
                    timeoutMs: 2000,
                    userMessage: "x",
                },
            });
            setTimeout(() => {
                const el = document.createElement("div");
                el.id = "late";
                document.body.appendChild(el);
            }, 150);

            const result = await promise;
            expect(result.data.matchedCount).toBeGreaterThanOrEqual(1);
            expect(result.data.attempts).toBeGreaterThanOrEqual(1);
        });

        test("times out when the selector never matches", async () => {
            await expect(
                CLIENT_SIDE_TOOL_HANDLERS.waitforappletelement({
                    toolArgs: {
                        selector: "#never",
                        timeoutMs: 200,
                        userMessage: "x",
                    },
                }),
            ).rejects.toThrow(/Timed out/);
        });

        test("gone:true waits for an element to disappear", async () => {
            document.body.innerHTML = `<div id="spinner"></div>`;
            const promise = CLIENT_SIDE_TOOL_HANDLERS.waitforappletelement({
                toolArgs: {
                    selector: "#spinner",
                    gone: true,
                    timeoutMs: 2000,
                    userMessage: "x",
                },
            });
            setTimeout(() => {
                document.getElementById("spinner")?.remove();
            }, 150);

            const result = await promise;
            expect(result.data.matchedCount).toBe(0);
            expect(result.data.gone).toBe(true);
        });
    });

    describe("ReadAppletConsole", () => {
        test("returns the most recent entries (capped) and clears when asked", async () => {
            const consoleEntries = [
                { level: "log", message: "first" },
                { level: "info", message: "second" },
                { level: "warn", message: "third" },
                { level: "error", message: "fourth" },
            ];
            const networkRequests = [
                { url: "/ok", status: 200 },
                { url: "/fail", status: 500 },
                { url: "/err", error: "Network error" },
            ];
            mockInspectApplet.mockResolvedValueOnce({
                consoleEntries,
                networkRequests,
            });

            const result = await CLIENT_SIDE_TOOL_HANDLERS.readappletconsole({
                toolArgs: { limit: 2, clear: true, userMessage: "x" },
            });

            expect(mockInspectApplet).toHaveBeenCalledWith({ clear: true });
            // limit:2 means the most recent two (preserving order)
            expect(result.data.consoleEntries).toEqual([
                { level: "warn", message: "third" },
                { level: "error", message: "fourth" },
            ]);
            expect(result.data.failingNetworkRequests).toEqual([
                { url: "/fail", status: 500 },
                { url: "/err", error: "Network error" },
            ]);
            expect(result.data.cleared).toBe(true);
            expect(result.data.totalCaptured).toBe(4);
        });

        test("filters by level when levels are supplied", async () => {
            mockInspectApplet.mockResolvedValueOnce({
                consoleEntries: [
                    { level: "log", message: "a" },
                    { level: "warn", message: "b" },
                    { level: "error", message: "c" },
                ],
                networkRequests: [],
            });

            const result = await CLIENT_SIDE_TOOL_HANDLERS.readappletconsole({
                toolArgs: { levels: ["error"], userMessage: "x" },
            });

            expect(result.data.consoleEntries).toEqual([
                { level: "error", message: "c" },
            ]);
        });
    });

    describe("GetAppletPageSnapshot", () => {
        test("summarizes headings, buttons, fields, and recent errors", async () => {
            document.title = "Demo Applet";
            document.body.innerHTML = `
                <h1>Title</h1>
                <h2>Sub</h2>
                <button id="b1" data-testid="go">Go</button>
                <a href="/somewhere">Link</a>
                <input id="email" type="email" />
                <input id="pwd" type="password" />
            `;
            document.getElementById("email").value = "hello@example.com";
            document.getElementById("pwd").value = "supersecret";

            // jsdom doesn't compute layout, so getBoundingClientRect returns
            // zero-sized rects. Stub it so the snapshot's visibility filter
            // includes the test elements.
            for (const el of document.body.querySelectorAll(
                "button, a[href]",
            )) {
                el.getBoundingClientRect = () => ({
                    width: 10,
                    height: 10,
                    top: 0,
                    left: 0,
                    right: 10,
                    bottom: 10,
                });
            }

            mockInspectApplet.mockResolvedValueOnce({
                consoleEntries: [
                    { level: "log", message: "ignored" },
                    { level: "warn", message: "watch out" },
                    { level: "error", message: "kaboom" },
                ],
                networkRequests: [{ url: "/fail", status: 503 }],
            });

            const result =
                await CLIENT_SIDE_TOOL_HANDLERS.getappletpagesnapshot({
                    toolArgs: { userMessage: "x" },
                });

            expect(result.data.appletId).toBe("applet-1");
            expect(result.data.title).toBe("Demo Applet");
            expect(result.data.headings.map((h) => h.tag)).toEqual([
                "h1",
                "h2",
            ]);
            expect(result.data.buttons[0].attrs["data-testid"]).toBe("go");
            expect(result.data.links[0].href).toBe("/somewhere");
            expect(result.data.fields).toHaveLength(2);
            const passwordField = result.data.fields.find(
                (f) => f.attrs?.id === "pwd",
            );
            expect(passwordField.value).toBe("[redacted]");
            expect(passwordField.sensitive).toBe(true);
            const emailField = result.data.fields.find(
                (f) => f.attrs?.id === "email",
            );
            expect(emailField.value).toBe("hello@example.com");
            expect(result.data.consoleErrors).toEqual([
                { level: "warn", message: "watch out" },
                { level: "error", message: "kaboom" },
            ]);
            expect(result.data.failingNetworkRequests).toEqual([
                { url: "/fail", status: 503 },
            ]);
        });

        test("includeText returns a truncated body text dump", async () => {
            document.body.innerHTML = `<p>${"x".repeat(3000)}</p>`;
            mockInspectApplet.mockResolvedValueOnce({
                consoleEntries: [],
                networkRequests: [],
            });

            const result =
                await CLIENT_SIDE_TOOL_HANDLERS.getappletpagesnapshot({
                    toolArgs: { includeText: true, userMessage: "x" },
                });

            expect(result.data.bodyText.length).toBeLessThanOrEqual(2000);
        });

        test("falls back gracefully when inspectApplet fails", async () => {
            mockInspectApplet.mockRejectedValueOnce(new Error("SDK missing"));

            const result =
                await CLIENT_SIDE_TOOL_HANDLERS.getappletpagesnapshot({
                    toolArgs: { userMessage: "x" },
                });

            expect(result.data.consoleErrors[0].message).toMatch(
                /Console inspect unavailable/,
            );
        });

        test("throws when no applet is open", async () => {
            mockGetActiveAppletSandbox.mockReturnValueOnce(null);

            await expect(
                CLIENT_SIDE_TOOL_HANDLERS.getappletpagesnapshot({
                    toolArgs: { userMessage: "x" },
                }),
            ).rejects.toThrow(/No applet is currently open/);
        });
    });
});
