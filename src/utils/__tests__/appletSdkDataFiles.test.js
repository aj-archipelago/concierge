/**
 * @jest-environment jsdom
 */

describe("ConciergeSDK data and files namespaces", () => {
    let ConciergeSDK;
    let fetchMock;

    beforeEach(() => {
        // Clear any existing SDK
        delete window.ConciergeSDK;

        // Clear meta tags
        document.head.innerHTML = "";

        // Reset fetch mock
        fetchMock = jest.fn();
        global.fetch = fetchMock;
        window.fetch = fetchMock;

        // Load the SDK by executing the IIFE
        jest.isolateModules(() => {
            require("../../../public/applet-sdk.js");
        });

        // The SDK installs a monitoring wrapper around fetch; restore the
        // direct mock so these unit tests can control/assert requests.
        global.fetch = fetchMock;
        window.fetch = fetchMock;

        ConciergeSDK = window.ConciergeSDK;
    });

    afterEach(() => {
        delete window.ConciergeSDK;
        document.head.innerHTML = "";
    });

    describe("version", () => {
        test("should be 1.8.0", () => {
            expect(ConciergeSDK.version).toBe("1.8.0");
        });
    });

    describe("locale", () => {
        test("coerces invalid globals to supported en/ltr values", () => {
            window.CONCIERGE_LANGUAGE = "fr";
            window.CONCIERGE_DIRECTION = "invalid";

            expect(ConciergeSDK.locale.get()).toEqual({
                language: "en",
                direction: "ltr",
            });
            expect(ConciergeSDK.locale.getLanguage()).toBe("en");
            expect(ConciergeSDK.locale.getDirection()).toBe("ltr");
            expect(ConciergeSDK.locale.isRtl()).toBe(false);
        });

        test("returns ar/rtl when globals are valid", () => {
            window.CONCIERGE_LANGUAGE = "ar";
            window.CONCIERGE_DIRECTION = "rtl";

            expect(ConciergeSDK.locale.get()).toEqual({
                language: "ar",
                direction: "rtl",
            });
            expect(ConciergeSDK.locale.isRtl()).toBe(true);
        });
    });

    describe("applet ID detection", () => {
        test("data.get rejects when no applet-id meta tag", async () => {
            await expect(ConciergeSDK.data.get()).rejects.toThrow(
                "No applet-id meta tag found",
            );
        });

        test("data.set rejects when no applet-id meta tag", async () => {
            await expect(ConciergeSDK.data.set("key", "value")).rejects.toThrow(
                "No applet-id meta tag found",
            );
        });

        test("files.list rejects when no applet-id meta tag", async () => {
            await expect(ConciergeSDK.files.list()).rejects.toThrow(
                "No applet-id meta tag found",
            );
        });

        test("sharedData.get rejects when no applet-id meta tag", async () => {
            await expect(ConciergeSDK.sharedData.get("workspace")).rejects.toThrow(
                "No applet-id meta tag found",
            );
        });

        test("files.upload rejects when no applet-id meta tag", async () => {
            const file = new File(["content"], "test.txt", {
                type: "text/plain",
            });
            await expect(ConciergeSDK.files.upload(file)).rejects.toThrow(
                "No applet-id meta tag found",
            );
        });

        test("files.getContentUrl throws when no applet-id meta tag", () => {
            expect(() => ConciergeSDK.files.getContentUrl("fileId")).toThrow(
                "No applet-id meta tag found",
            );
        });

        test("files.delete rejects when no applet-id meta tag", async () => {
            await expect(ConciergeSDK.files.delete("file.txt")).rejects.toThrow(
                "No applet-id meta tag found",
            );
        });

        test("models.list rejects when no applet-id meta tag", async () => {
            await expect(ConciergeSDK.models.list()).rejects.toThrow(
                "No applet-id meta tag found",
            );
        });

        test("models.generate rejects when no applet-id meta tag", async () => {
            await expect(
                ConciergeSDK.models.generate({ prompt: "Hello" }),
            ).rejects.toThrow("No applet-id meta tag found");
        });
    });

    describe("data namespace", () => {
        beforeEach(() => {
            const meta = document.createElement("meta");
            meta.name = "applet-id";
            meta.content = "abc123";
            document.head.appendChild(meta);
        });

        describe("data.get", () => {
            test("calls correct endpoint", async () => {
                global.fetch.mockResolvedValue({
                    ok: true,
                    json: () => Promise.resolve({ data: { counter: 42 } }),
                });

                const result = await ConciergeSDK.data.get();

                expect(global.fetch).toHaveBeenCalledWith(
                    "/api/canvas-applets/abc123/data",
                    {
                        method: "GET",
                        credentials: "include",
                    },
                );
                expect(result).toEqual({ counter: 42 });
            });

            test("handles error response", async () => {
                global.fetch.mockResolvedValue({
                    ok: false,
                    json: () => Promise.resolve({ error: "Applet not found" }),
                });

                await expect(ConciergeSDK.data.get()).rejects.toThrow(
                    "Applet not found",
                );
            });
        });

        describe("data.set", () => {
            test("calls correct endpoint with key and value", async () => {
                global.fetch.mockResolvedValue({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            success: true,
                            data: { counter: 42 },
                        }),
                });

                const result = await ConciergeSDK.data.set("counter", 42);

                expect(global.fetch).toHaveBeenCalledWith(
                    "/api/canvas-applets/abc123/data",
                    {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ key: "counter", value: 42 }),
                    },
                );
                expect(result).toEqual({ counter: 42 });
            });

            test("rejects when key is not a string", async () => {
                await expect(ConciergeSDK.data.set(123, "value")).rejects.toThrow(
                    "key must be a non-empty string",
                );
            });

            test("rejects when key is empty", async () => {
                await expect(ConciergeSDK.data.set("", "value")).rejects.toThrow(
                    "key must be a non-empty string",
                );
            });

            test("rejects when value is undefined", async () => {
                await expect(ConciergeSDK.data.set("key")).rejects.toThrow(
                    "value is required",
                );
            });

            test("allows null value", async () => {
                global.fetch.mockResolvedValue({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            success: true,
                            data: { key: null },
                        }),
                });

                const result = await ConciergeSDK.data.set("key", null);
                expect(result).toEqual({ key: null });
            });

            test("does not retry rate-limited writes", async () => {
                global.fetch.mockResolvedValue({
                    ok: false,
                    status: 429,
                    headers: { get: () => "4" },
                    json: () =>
                        Promise.resolve({
                            error: "Applet SDK rate limit exceeded",
                            code: "APPLET_SDK_RATE_LIMITED",
                        }),
                });

                await expect(
                    ConciergeSDK.data.set("counter", 42),
                ).rejects.toMatchObject({
                    message: "Applet SDK rate limit exceeded",
                    status: 429,
                    code: "APPLET_SDK_RATE_LIMITED",
                    retryAfter: 4000,
                });
                expect(global.fetch).toHaveBeenCalledTimes(1);
            });
        });
    });

    describe("files namespace", () => {
        beforeEach(() => {
            const meta = document.createElement("meta");
            meta.name = "applet-id";
            meta.content = "abc123";
            document.head.appendChild(meta);
        });

        describe("files.list", () => {
            test("calls correct endpoint", async () => {
                const mockFiles = [{ _id: "f1", filename: "photo.jpg" }];
                global.fetch.mockResolvedValue({
                    ok: true,
                    json: () => Promise.resolve({ files: mockFiles }),
                });

                const result = await ConciergeSDK.files.list();

                expect(global.fetch).toHaveBeenCalledWith(
                    "/api/canvas-applets/abc123/files",
                    {
                        method: "GET",
                        credentials: "include",
                    },
                );
                expect(result).toEqual(mockFiles);
            });
        });

        describe("files.upload", () => {
            test("calls correct endpoint with FormData", async () => {
                const file = new File(["content"], "test.txt", {
                    type: "text/plain",
                });
                const mockResponse = {
                    success: true,
                    file: { _id: "f1", filename: "test.txt" },
                    files: [{ _id: "f1", filename: "test.txt" }],
                };
                global.fetch.mockResolvedValue({
                    ok: true,
                    json: () => Promise.resolve(mockResponse),
                });

                const result = await ConciergeSDK.files.upload(file);

                expect(global.fetch).toHaveBeenCalledWith(
                    "/api/canvas-applets/abc123/files",
                    expect.objectContaining({
                        method: "POST",
                        credentials: "include",
                    }),
                );
                // Verify FormData was passed
                const callArgs = global.fetch.mock.calls[0][1];
                expect(callArgs.body).toBeInstanceOf(FormData);
                expect(result).toEqual(mockResponse);
            });

            test("rejects when argument is not a File", async () => {
                await expect(
                    ConciergeSDK.files.upload("not-a-file"),
                ).rejects.toThrow("file must be a File object");
            });

            test("rejects when argument is null", async () => {
                await expect(ConciergeSDK.files.upload(null)).rejects.toThrow(
                    "file must be a File object",
                );
            });
        });

        describe("files.getContentUrl", () => {
            test("returns correct URL", () => {
                const url = ConciergeSDK.files.getContentUrl("file123");
                expect(url).toBe(
                    "/api/canvas-applets/abc123/files/file123/content",
                );
            });

            test("throws when fileId is not a string", () => {
                expect(() => ConciergeSDK.files.getContentUrl(123)).toThrow(
                    "fileId must be a non-empty string",
                );
            });

            test("throws when fileId is empty", () => {
                expect(() => ConciergeSDK.files.getContentUrl("")).toThrow(
                    "fileId must be a non-empty string",
                );
            });
        });

        describe("files.delete", () => {
            test("calls correct endpoint", async () => {
                global.fetch.mockResolvedValue({
                    ok: true,
                    json: () => Promise.resolve({ success: true, files: [] }),
                });

                const result = await ConciergeSDK.files.delete("photo.jpg");

                expect(global.fetch).toHaveBeenCalledWith(
                    "/api/canvas-applets/abc123/files?filename=photo.jpg",
                    {
                        method: "DELETE",
                        credentials: "include",
                    },
                );
                expect(result.files).toEqual([]);
            });

            test("encodes filename in URL", async () => {
                global.fetch.mockResolvedValue({
                    ok: true,
                    json: () => Promise.resolve({ success: true, files: [] }),
                });

                await ConciergeSDK.files.delete("my file (1).jpg");

                expect(global.fetch).toHaveBeenCalledWith(
                    "/api/canvas-applets/abc123/files?filename=my%20file%20(1).jpg",
                    expect.any(Object),
                );
            });

            test("rejects when filename is not a string", async () => {
                await expect(ConciergeSDK.files.delete(123)).rejects.toThrow(
                    "filename must be a non-empty string",
                );
            });

            test("rejects when filename is empty", async () => {
                await expect(ConciergeSDK.files.delete("")).rejects.toThrow(
                    "filename must be a non-empty string",
                );
            });
        });
    });

    describe("sharedData namespace", () => {
        beforeEach(() => {
            const meta = document.createElement("meta");
            meta.name = "applet-id";
            meta.content = "abc123";
            document.head.appendChild(meta);
        });

        test("sharedData.get calls revision-protected shared endpoint", async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        found: true,
                        value: { sources: [1] },
                        revision: "3",
                    }),
            });

            const result = await ConciergeSDK.sharedData.get("workspace");

            expect(global.fetch).toHaveBeenCalledWith(
                "/api/canvas-applets/abc123/shared-data/workspace",
                {
                    method: "GET",
                    credentials: "include",
                },
            );
            expect(result).toEqual({
                found: true,
                value: { sources: [1] },
                revision: "3",
            });
        });

        test("sharedData.set sends revision and safety flags", async () => {
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            found: true,
                            key: "workspace",
                            value: { sources: [1] },
                            revision: "3",
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            success: true,
                            key: "workspace",
                            value: { sources: [1, 2] },
                            revision: "4",
                        }),
                });

            await ConciergeSDK.sharedData.get("workspace");
            const result = await ConciergeSDK.sharedData.set("workspace", {
                sources: [1, 2],
            });

            expect(global.fetch).toHaveBeenLastCalledWith(
                "/api/canvas-applets/abc123/shared-data/workspace",
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        value: { sources: [1, 2] },
                        expectedRevision: "3",
                        reset: false,
                    }),
                },
            );
            expect(result).toEqual({
                success: true,
                key: "workspace",
                value: { sources: [1, 2] },
                revision: "4",
            });
        });

        test("sharedData.backups returns backup list", async () => {
            const backups = [{ id: "backup1", revision: "2" }];
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ backups }),
            });

            const result = await ConciergeSDK.sharedData.backups("workspace");

            expect(global.fetch).toHaveBeenCalledWith(
                "/api/canvas-applets/abc123/shared-data/workspace/backups",
                {
                    method: "GET",
                    credentials: "include",
                },
            );
            expect(result).toEqual(backups);
        });

        test("sharedData.restore restores by backup id", async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        success: true,
                        value: { sources: [1] },
                        revision: "5",
                    }),
            });

            const result = await ConciergeSDK.sharedData.restore(
                "workspace",
                "backup1",
            );

            expect(global.fetch).toHaveBeenCalledWith(
                "/api/canvas-applets/abc123/shared-data/workspace/restore",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        backupId: "backup1",
                        revision: undefined,
                    }),
                },
            );
            expect(result).toEqual({
                success: true,
                value: { sources: [1] },
                revision: "5",
            });
        });

        test("sharedData.restore treats numeric second argument as revision", async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        success: true,
                        key: "workspace",
                        value: { sources: [1] },
                        revision: "5",
                    }),
            });

            await ConciergeSDK.sharedData.restore("workspace", 3);

            expect(global.fetch).toHaveBeenCalledWith(
                "/api/canvas-applets/abc123/shared-data/workspace/restore",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        backupId: undefined,
                        revision: 3,
                    }),
                },
            );

            await ConciergeSDK.sharedData.set("workspace", { sources: [2] });

            expect(global.fetch).toHaveBeenLastCalledWith(
                "/api/canvas-applets/abc123/shared-data/workspace",
                expect.objectContaining({
                    body: JSON.stringify({
                        value: { sources: [2] },
                        expectedRevision: "5",
                        reset: false,
                    }),
                }),
            );
        });

        test("sharedData.set rejects missing value", async () => {
            await expect(ConciergeSDK.sharedData.set("workspace")).rejects.toThrow(
                "value is required",
            );
        });

        test("sharedData.set rejects non-object values", async () => {
            await expect(
                ConciergeSDK.sharedData.set("workspace", "not an object"),
            ).rejects.toThrow("value must be an object");
        });

        test("sharedData.reset sends explicit reset flag", async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        success: true,
                        key: "workspace",
                        value: { sources: [] },
                        revision: "5",
                    }),
            });

            await ConciergeSDK.sharedData.reset("workspace", { sources: [] });

            expect(global.fetch).toHaveBeenCalledWith(
                "/api/canvas-applets/abc123/shared-data/workspace",
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        value: { sources: [] },
                        reset: true,
                    }),
                },
            );
        });
    });

    describe("services namespace", () => {
        beforeEach(() => {
            const meta = document.createElement("meta");
            meta.name = "applet-id";
            meta.content = "abc123";
            document.head.appendChild(meta);
        });

        describe("services.getAccessToken", () => {
            test("preserves OAuth connection details on access token errors", async () => {
                const connectInfo = {
                    service: "github",
                    oauthUrl: "/api/connectors/github/connect",
                };
                global.fetch.mockResolvedValue({
                    ok: false,
                    status: 401,
                    json: () =>
                        Promise.resolve({
                            error: "GitHub is not connected",
                            code: "SERVICE_NOT_CONNECTED",
                            connectInfo,
                        }),
                });
                jest.spyOn(window, "open").mockReturnValue(null);

                await expect(
                    ConciergeSDK.services.getAccessToken({ service: "github" }),
                ).rejects.toMatchObject({
                    message:
                        "Popup blocked. Please allow popups to connect github.",
                    code: "POPUP_BLOCKED",
                });

                expect(window.open).toHaveBeenCalledWith(
                    expect.stringContaining("/api/connectors/github/connect"),
                    "concierge-oauth",
                    expect.any(String),
                );
                expect(global.fetch).toHaveBeenCalledTimes(1);
                window.open.mockRestore();
            });
        });
    });

    describe("models namespace", () => {
        beforeEach(() => {
            const meta = document.createElement("meta");
            meta.name = "applet-id";
            meta.content = "abc123";
            document.head.appendChild(meta);
        });

        describe("models.list", () => {
            test("calls correct endpoint", async () => {
                const mockResponse = {
                    models: [{ id: "oai-gpt4o", name: "GPT-4o" }],
                    defaultModel: "oai-gpt4o",
                    reasoningEfforts: ["none", "low", "medium", "high"],
                };
                global.fetch.mockResolvedValue({
                    ok: true,
                    json: () => Promise.resolve(mockResponse),
                });

                const result = await ConciergeSDK.models.list();

                expect(global.fetch).toHaveBeenCalledWith(
                    "/api/applet/models?appletId=abc123",
                    {
                        method: "GET",
                        credentials: "include",
                    },
                );
                expect(result).toEqual(mockResponse);
            });
        });

        describe("models.generate", () => {
            test("calls correct endpoint with prompt, model, and reasoning effort", async () => {
                global.fetch.mockResolvedValue({
                    ok: true,
                    json: () => Promise.resolve({ result: "مرحبا" }),
                });

                const result = await ConciergeSDK.models.generate({
                    prompt: "Translate hello to Arabic",
                    model: "oai-gpt4o",
                    reasoningEffort: "low",
                    systemPrompt: "Return only the translation.",
                });

                expect(global.fetch).toHaveBeenCalledWith(
                    "/api/applet/model-generate",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({
                            appletId: "abc123",
                            prompt: "Translate hello to Arabic",
                            systemPrompt: "Return only the translation.",
                            model: "oai-gpt4o",
                            reasoningEffort: "low",
                        }),
                    },
                );
                expect(result).toEqual({ result: "مرحبا" });
            });

            test("calls correct endpoint with messages", async () => {
                global.fetch.mockResolvedValue({
                    ok: true,
                    json: () => Promise.resolve({ result: "done" }),
                });

                await ConciergeSDK.models.generate({
                    messages: [{ role: "user", content: "Classify this" }],
                });

                expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
                    appletId: "abc123",
                    messages: [{ role: "user", content: "Classify this" }],
                });
            });

            test("rejects without prompt or messages", async () => {
                await expect(ConciergeSDK.models.generate({})).rejects.toThrow(
                    "prompt or messages array is required",
                );
            });

            test("backs off and retries rate-limited model calls", async () => {
                const setTimeoutSpy = jest
                    .spyOn(window, "setTimeout")
                    .mockImplementation((callback) => {
                        callback();
                        return 1;
                    });

                global.fetch
                    .mockResolvedValueOnce({
                        ok: false,
                        status: 429,
                        headers: { get: () => "2" },
                        json: () =>
                            Promise.resolve({
                                error: "Applet SDK rate limit exceeded",
                                code: "APPLET_SDK_RATE_LIMITED",
                            }),
                    })
                    .mockResolvedValueOnce({
                        ok: true,
                        json: () => Promise.resolve({ result: "done" }),
                    });

                const result = await ConciergeSDK.models.generate({
                    prompt: "Summarize this",
                });

                expect(result).toEqual({ result: "done" });
                expect(global.fetch).toHaveBeenCalledTimes(2);
                expect(setTimeoutSpy).toHaveBeenCalledWith(
                    expect.any(Function),
                    2000,
                );
                setTimeoutSpy.mockRestore();
            });
        });
    });
});
