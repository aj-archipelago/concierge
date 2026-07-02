/**
 * @jest-environment jsdom
 */

const { ReadableStream } = require("stream/web");
const { TextEncoder } = require("util");

describe("ConciergeSDK data and files namespaces", () => {
    let ConciergeSDK;
    let fetchMock;
    let originalParent;

    beforeEach(() => {
        // Clear any existing SDK
        delete window.ConciergeSDK;
        originalParent = window.parent;

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
        Object.defineProperty(window, "parent", {
            value: originalParent,
            configurable: true,
        });
    });

    describe("version", () => {
        test("should be 1.12.0", () => {
            expect(ConciergeSDK.version).toBe("1.12.0");
        });
    });

    describe("locale", () => {
        test("coerces invalid globals to supported en/ltr values", () => {
            window.LABEEB_LANGUAGE = "fr";
            window.LABEEB_DIRECTION = "invalid";

            expect(ConciergeSDK.locale.get()).toEqual({
                language: "en",
                direction: "ltr",
            });
            expect(ConciergeSDK.locale.getLanguage()).toBe("en");
            expect(ConciergeSDK.locale.getDirection()).toBe("ltr");
            expect(ConciergeSDK.locale.isRtl()).toBe(false);
        });

        test("returns ar/rtl when globals are valid", () => {
            window.LABEEB_LANGUAGE = "ar";
            window.LABEEB_DIRECTION = "rtl";

            expect(ConciergeSDK.locale.get()).toEqual({
                language: "ar",
                direction: "rtl",
            });
            expect(ConciergeSDK.locale.isRtl()).toBe(true);
        });
    });

    describe("navigation", () => {
        test("open sends a host navigation request and resolves the response", async () => {
            const parentWindow = {
                postMessage: jest.fn(),
            };
            Object.defineProperty(window, "parent", {
                value: parentWindow,
                configurable: true,
            });

            const navigationPromise = ConciergeSDK.navigation.open(
                "/apps/foo?view=full",
            );

            expect(parentWindow.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "__LABEEB_NAVIGATION_REQUEST__",
                    path: "/apps/foo?view=full",
                    replace: false,
                }),
                "*",
            );

            const request = parentWindow.postMessage.mock.calls[0][0];
            window.dispatchEvent(
                new MessageEvent("message", {
                    data: {
                        type: "__LABEEB_NAVIGATION_RESPONSE__",
                        requestId: request.requestId,
                        success: true,
                        path: "/apps/foo?view=full",
                        replace: false,
                    },
                }),
            );

            await expect(navigationPromise).resolves.toEqual({
                success: true,
                path: "/apps/foo?view=full",
                replace: false,
            });
        });

        test("navigate is an alias for open", async () => {
            const parentWindow = {
                postMessage: jest.fn(),
            };
            Object.defineProperty(window, "parent", {
                value: parentWindow,
                configurable: true,
            });

            const navigationPromise = ConciergeSDK.navigation.navigate(
                "/apps/bar",
                { replace: true },
            );

            const request = parentWindow.postMessage.mock.calls[0][0];
            expect(request).toMatchObject({
                type: "__LABEEB_NAVIGATION_REQUEST__",
                path: "/apps/bar",
                replace: true,
            });

            window.dispatchEvent(
                new MessageEvent("message", {
                    data: {
                        type: "__LABEEB_NAVIGATION_RESPONSE__",
                        requestId: request.requestId,
                        success: true,
                        path: "/apps/bar",
                        replace: true,
                    },
                }),
            );

            await expect(navigationPromise).resolves.toEqual({
                success: true,
                path: "/apps/bar",
                replace: true,
            });
        });

        test("rejects non-internal navigation paths", async () => {
            await expect(
                ConciergeSDK.navigation.open("https://example.com"),
            ).rejects.toThrow("navigation path must be an internal path");
            await expect(
                ConciergeSDK.navigation.open("//evil.test"),
            ).rejects.toThrow("navigation path must be an internal path");
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
            await expect(
                ConciergeSDK.sharedData.get("workspace"),
            ).rejects.toThrow("No applet-id meta tag found");
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

        test("sourceQa.query rejects when no applet-id meta tag", async () => {
            await expect(
                ConciergeSDK.sourceQa.query({ text: "How is the US doing?" }),
            ).rejects.toThrow("No applet-id meta tag found");
        });

        test("sourceQa.initialQuestions rejects when no applet-id meta tag", async () => {
            await expect(
                ConciergeSDK.sourceQa.initialQuestions({ language: "en" }),
            ).rejects.toThrow("No applet-id meta tag found");
        });

        test("models.generate rejects when no applet-id meta tag", async () => {
            await expect(
                ConciergeSDK.models.generate({ prompt: "Hello" }),
            ).rejects.toThrow("No applet-id meta tag found");
        });

        test("workspace.prompts.list rejects when no applet-id meta tag", async () => {
            await expect(ConciergeSDK.workspace.prompts.list()).rejects.toThrow(
                "No applet-id meta tag found",
            );
        });

        test("workspace.prompts.run rejects when no applet-id meta tag", async () => {
            await expect(
                ConciergeSDK.workspace.prompts.run({ promptId: "prompt-1" }),
            ).rejects.toThrow("No applet-id meta tag found");
        });

        test("media.transcribe rejects when no applet-id meta tag", async () => {
            await expect(
                ConciergeSDK.media.transcribe({
                    url: "https://example.com/video.mp4",
                }),
            ).rejects.toThrow("No applet-id meta tag found");
        });

        test("media.translateSubtitles rejects when no applet-id meta tag", async () => {
            await expect(
                ConciergeSDK.media.translateSubtitles({
                    text: "1\n00:00:00,000 --> 00:00:01,000\nHello",
                    to: "Arabic",
                }),
            ).rejects.toThrow("No applet-id meta tag found");
        });

        test("tasks.get rejects when no applet-id meta tag", async () => {
            await expect(ConciergeSDK.tasks.get("task-1")).rejects.toThrow(
                "No applet-id meta tag found",
            );
        });
    });

    describe("sourceQa namespace", () => {
        function mockSourceQaSseResponse(finalResponse, chunks = []) {
            const encoder = new TextEncoder();
            global.fetch.mockResolvedValue({
                ok: true,
                body: new ReadableStream({
                    start(controller) {
                        chunks.forEach((chunk) => {
                            controller.enqueue(
                                encoder.encode(
                                    `data: ${JSON.stringify({
                                        event: "data",
                                        data: { chunk },
                                    })}\n\n`,
                                ),
                            );
                        });
                        controller.enqueue(
                            encoder.encode(
                                `data: ${JSON.stringify({
                                    event: "complete",
                                    data: finalResponse,
                                })}\n\n`,
                            ),
                        );
                        controller.close();
                    },
                }),
            });
        }

        beforeEach(() => {
            const meta = document.createElement("meta");
            meta.name = "applet-id";
            meta.content = "abc123";
            document.head.appendChild(meta);
        });

        test("sourceQa.query calls the applet source Q&A bridge", async () => {
            const mockResponse = {
                result: "Answer :cd_source[1]",
                citations: [{ title: "Source" }],
                confidence: "high",
                coverage: { adequate: true },
                metadata: { confidence: "high", coverage: { adequate: true } },
                resultData: {
                    confidence: "high",
                    coverage: { adequate: true },
                },
            };
            mockSourceQaSseResponse(mockResponse, ["Answer :cd_source[1]"]);

            const result = await ConciergeSDK.sourceQa.query({
                text: "How is the US doing in the world cup?",
                contextInfo: {
                    topic: "US soccer",
                    previousQuestion:
                        "What's going on with the US soccer team?",
                    previousAnswer:
                        "The USMNT is preparing for the 2026 World Cup.",
                },
                language: "English",
                maxSearchResults: 12,
                maxRefinementRounds: 1,
                searchInternet: false,
                maxInternetResults: 3,
                followUpQuestionCount: 4,
                skipAnswerSynthesis: true,
            });

            expect(global.fetch).toHaveBeenCalledWith("/api/applet/source-qa", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                signal: undefined,
                body: JSON.stringify({
                    appletId: "abc123",
                    text: "How is the US doing in the world cup?",
                    contextInfo: {
                        topic: "US soccer",
                        previousQuestion:
                            "What's going on with the US soccer team?",
                        previousAnswer:
                            "The USMNT is preparing for the 2026 World Cup.",
                    },
                    language: "English",
                    maxSearchResults: 12,
                    maxRefinementRounds: 1,
                    searchInternet: false,
                    maxInternetResults: 3,
                    followUpQuestionCount: 4,
                    skipAnswerSynthesis: true,
                    stream: true,
                }),
            });
            expect(result).toEqual(mockResponse);
        });

        test("sourceQa.stream reads SSE chunks and resolves final response", async () => {
            const encoder = new TextEncoder();
            const finalResponse = {
                result: "Hello :cd_source[1]",
                citations: [{ title: "Source" }],
                confidence: "medium",
                coverage: { adequate: true },
                followUpQuestions: ["What next?"],
                metadata: {},
                resultData: {},
                tool: {},
                rawResultData: null,
                rawTool: null,
                warnings: [],
                errors: [],
            };
            const onChunk = jest.fn();
            const onUpdate = jest.fn();
            const onComplete = jest.fn();
            global.fetch.mockResolvedValue({
                ok: true,
                body: new ReadableStream({
                    start(controller) {
                        controller.enqueue(
                            encoder.encode(
                                [
                                    `data: ${JSON.stringify({
                                        event: "metadata",
                                        data: {
                                            citations: [
                                                { title: "Early source" },
                                            ],
                                            confidence: "high",
                                            coverage: { adequate: true },
                                            metadata: {
                                                phase: "retrieval_complete",
                                            },
                                        },
                                    })}`,
                                    "",
                                    'data: {"event":"data","data":{"chunk":"Hello ","progress":0.5}}',
                                    "",
                                    `data: ${JSON.stringify({
                                        event: "complete",
                                        data: finalResponse,
                                    })}`,
                                    "",
                                    "",
                                ].join("\n"),
                            ),
                        );
                        controller.close();
                    },
                }),
            });

            const result = await ConciergeSDK.sourceQa.stream({
                text: "How is the US doing?",
                onChunk,
                onUpdate,
                onComplete,
            });

            expect(global.fetch).toHaveBeenCalledWith("/api/applet/source-qa", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                signal: undefined,
                body: JSON.stringify({
                    appletId: "abc123",
                    text: "How is the US doing?",
                    stream: true,
                }),
            });
            expect(onChunk).toHaveBeenCalledWith(
                "Hello ",
                expect.objectContaining({
                    progress: 0.5,
                    metadata: expect.objectContaining({
                        confidence: "high",
                        metadata: { phase: "retrieval_complete" },
                    }),
                }),
            );
            expect(onUpdate).toHaveBeenCalledWith(
                "metadata",
                expect.objectContaining({ confidence: "high" }),
            );
            expect(onUpdate).toHaveBeenCalledWith("complete", finalResponse);
            expect(onComplete).toHaveBeenCalledWith(finalResponse);
            expect(result).toEqual(finalResponse);
        });

        test("sourceQa.stream rejects when the SSE stream ends before complete metadata", async () => {
            const encoder = new TextEncoder();
            const onChunk = jest.fn();
            global.fetch.mockResolvedValue({
                ok: true,
                body: new ReadableStream({
                    start(controller) {
                        controller.enqueue(
                            encoder.encode(
                                'data: {"event":"data","data":{"chunk":"Hello ","progress":0.5}}\n\n',
                            ),
                        );
                        controller.close();
                    },
                }),
            });

            await expect(
                ConciergeSDK.sourceQa.stream({
                    text: "How is the US doing?",
                    onChunk,
                }),
            ).rejects.toThrow(
                "source Q&A stream ended before the final metadata was received",
            );
            expect(onChunk).toHaveBeenCalledWith(
                "Hello ",
                expect.objectContaining({ progress: 0.5 }),
            );
        });

        test("sourceQa.query delegates to stream when stream is true", async () => {
            const streamSpy = jest
                .spyOn(ConciergeSDK.sourceQa, "stream")
                .mockResolvedValue({ result: "streamed" });

            const result = await ConciergeSDK.sourceQa.query({
                text: "How is the US doing?",
                stream: true,
            });

            expect(streamSpy).toHaveBeenCalledWith({
                text: "How is the US doing?",
                stream: true,
            });
            expect(result).toEqual({ result: "streamed" });
            streamSpy.mockRestore();
        });

        test("sourceQa.query accepts question as an alias for text", async () => {
            mockSourceQaSseResponse({ result: "Answer" });

            await ConciergeSDK.sourceQa.query({ question: "What happened?" });

            expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
                appletId: "abc123",
                text: "What happened?",
                stream: true,
            });
        });

        test("sourceQa.query rejects when text is missing", async () => {
            await expect(ConciergeSDK.sourceQa.query({})).rejects.toThrow(
                "text is required",
            );
        });

        test("sourceQa.initialQuestions calls the applet starter endpoint", async () => {
            const mockResponse = {
                language: "en",
                sets: [["Question 1?", "Question 2?", "Question 3?"]],
                questions: [
                    {
                        question: "Question 1?",
                        answerCacheKey: "askaj:answer:v1:abc",
                    },
                ],
                cache: { hit: true },
            };
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });

            const result = await ConciergeSDK.sourceQa.initialQuestions({
                language: "ar",
                prewarmAnswers: false,
            });

            expect(global.fetch).toHaveBeenCalledWith(
                "/api/applet/source-qa/initial-questions",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        appletId: "abc123",
                        language: "ar",
                        prewarmAnswers: false,
                    }),
                },
            );
            expect(result).toEqual(mockResponse);
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

            test("can fetch a single key", async () => {
                global.fetch.mockResolvedValue({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            found: true,
                            key: "settings",
                            value: { theme: "dark" },
                        }),
                });

                const result = await ConciergeSDK.data.get("settings");

                expect(global.fetch).toHaveBeenCalledWith(
                    "/api/canvas-applets/abc123/data?key=settings",
                    {
                        method: "GET",
                        credentials: "include",
                    },
                );
                expect(result).toEqual({ theme: "dark" });
            });

            test("returns undefined when a single key is missing", async () => {
                global.fetch.mockResolvedValue({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            found: false,
                            key: "settings",
                        }),
                });

                await expect(
                    ConciergeSDK.data.get("settings"),
                ).resolves.toBeUndefined();
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
                await expect(
                    ConciergeSDK.data.set(123, "value"),
                ).rejects.toThrow("key must be a non-empty string");
            });

            test("rejects when key is empty", async () => {
                await expect(
                    ConciergeSDK.data.set("", "value"),
                ).rejects.toThrow("key must be a non-empty string");
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
            await expect(
                ConciergeSDK.sharedData.set("workspace"),
            ).rejects.toThrow("value is required");
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

    describe("workspace prompts namespace", () => {
        beforeEach(() => {
            const meta = document.createElement("meta");
            meta.name = "applet-id";
            meta.content = "abc123";
            document.head.appendChild(meta);
        });

        test("workspace.prompts.list calls the applet prompt bridge", async () => {
            const mockResponse = {
                workspaceId: "workspace-123",
                prompts: [{ _id: "prompt-1", title: "Brief" }],
            };
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });

            const result = await ConciergeSDK.workspace.prompts.list();

            expect(global.fetch).toHaveBeenCalledWith(
                "/api/canvas-applets/abc123/workspace-prompts",
                {
                    method: "GET",
                    credentials: "include",
                },
            );
            expect(result).toEqual(mockResponse);
        });

        test("workspace.prompts.run calls the applet prompt run bridge", async () => {
            const mockResponse = { output: "done", citations: [] };
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });

            const result = await ConciergeSDK.workspace.prompts.run({
                promptId: "prompt-1",
                input: "Summarize this",
                files: [{ hash: "file-1" }],
            });

            expect(global.fetch).toHaveBeenCalledWith(
                "/api/canvas-applets/abc123/workspace-prompts/prompt-1/run",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        prompt: "Summarize this",
                        files: [{ hash: "file-1" }],
                        chatHistory: null,
                        systemPrompt: null,
                    }),
                },
            );
            expect(result).toEqual(mockResponse);
        });

        test("workspace.prompts.run rejects missing promptId", async () => {
            await expect(
                ConciergeSDK.workspace.prompts.run({}),
            ).rejects.toThrow("promptId must be a non-empty string");
        });
    });

    describe("media namespace", () => {
        beforeEach(() => {
            const meta = document.createElement("meta");
            meta.name = "applet-id";
            meta.content = "abc123";
            document.head.appendChild(meta);
        });

        test("media.transcribe starts an applet media task", async () => {
            const mockResponse = { taskId: "task-1", jobId: "job-1" };
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });

            const result = await ConciergeSDK.media.transcribe({
                url: "https://example.com/video.mp4",
                language: "ar",
                responseFormat: "vtt",
                wordTimestamped: true,
                maxLineCount: 1,
                maxLineWidth: 35,
                maxWordsPerLine: 3,
                highlightWords: true,
                modelOption: "Whisper",
            });

            expect(global.fetch).toHaveBeenCalledWith(
                "/api/applet/media",
                expect.objectContaining({
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                }),
            );
            expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
                appletId: "abc123",
                operation: "transcribe",
                url: "https://example.com/video.mp4",
                language: "ar",
                responseFormat: "vtt",
                wordTimestamped: true,
                maxLineCount: 1,
                maxLineWidth: 35,
                maxWordsPerLine: 3,
                highlightWords: true,
                modelOption: "Whisper",
            });
            expect(result).toEqual(mockResponse);
        });

        test("media.transcribe uploads a File and starts a file-backed task", async () => {
            const file = new File(["video"], "clip.mp4", {
                type: "video/mp4",
            });
            const uploadResponse = {
                success: true,
                file: { _id: "file-123", filename: "clip.mp4" },
            };
            const taskResponse = { taskId: "task-file", jobId: "job-file" };
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(uploadResponse),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(taskResponse),
                });

            const result = await ConciergeSDK.media.transcribe({
                file,
                responseFormat: "vtt",
                wordTimestamped: true,
                highlightWords: true,
            });

            expect(global.fetch).toHaveBeenNthCalledWith(
                1,
                "/api/canvas-applets/abc123/files",
                expect.objectContaining({
                    method: "POST",
                    credentials: "include",
                    body: expect.any(FormData),
                }),
            );
            expect(global.fetch).toHaveBeenNthCalledWith(
                2,
                "/api/applet/media",
                expect.objectContaining({
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                }),
            );
            expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
                appletId: "abc123",
                operation: "transcribe",
                fileId: "file-123",
                responseFormat: "vtt",
                wordTimestamped: true,
                highlightWords: true,
            });
            expect(result).toEqual(taskResponse);
        });

        test("media.transcribe accepts an uploaded file object", async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ taskId: "task-file" }),
            });

            await ConciergeSDK.media.transcribe({
                file: { _id: "file-123" },
                responseFormat: "vtt",
            });

            expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
                appletId: "abc123",
                operation: "transcribe",
                fileId: "file-123",
                responseFormat: "vtt",
            });
        });

        test("media.translateSubtitles starts an applet subtitle translation task", async () => {
            const mockResponse = { taskId: "task-2", jobId: "job-2" };
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });

            const result = await ConciergeSDK.media.translateSubtitles({
                text: "1\n00:00:00,000 --> 00:00:01,000\nHello",
                to: "Arabic",
                format: "srt",
                name: "Arabic subtitles",
            });

            expect(global.fetch).toHaveBeenCalledWith("/api/applet/media", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    appletId: "abc123",
                    operation: "translate-subtitles",
                    text: "1\n00:00:00,000 --> 00:00:01,000\nHello",
                    to: "Arabic",
                    format: "srt",
                    name: "Arabic subtitles",
                }),
            });
            expect(result).toEqual(mockResponse);
        });

        test("media.models lists applet media generation models", async () => {
            const mockResponse = {
                defaultModel: "image-model",
                models: [{ id: "image-model", category: "image" }],
            };
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });

            const result = await ConciergeSDK.media.models();

            expect(global.fetch).toHaveBeenCalledWith(
                "/api/applet/models?appletId=abc123&kind=media",
                {
                    method: "GET",
                    credentials: "include",
                },
            );
            expect(result).toEqual(mockResponse);
        });

        test("media.createImage starts a media generation task with references and settings", async () => {
            const mockResponse = { taskId: "task-media", jobId: "job-media" };
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse),
            });

            const result = await ConciergeSDK.media.createImage({
                prompt: "Make a poster",
                model: "image-model",
                aspectRatio: "16:9",
                quality: "high",
                outputFolder: "applets/assets/demo",
                inputImages: [
                    {
                        url: "https://example.com/source.png",
                        role: "reference",
                        blobPath: "media/source.png",
                        hash: "hash-1",
                    },
                ],
            });

            expect(global.fetch).toHaveBeenCalledWith(
                "/api/applet/media",
                expect.objectContaining({
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                }),
            );
            expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
                appletId: "abc123",
                operation: "create-media",
                outputType: "image",
                mediaKind: "image",
                prompt: "Make a poster",
                model: "image-model",
                aspectRatio: "16:9",
                quality: "high",
                outputFolder: "applets/assets/demo",
                inputImages: [
                    {
                        url: "https://example.com/source.png",
                        role: "reference",
                        blobPath: "media/source.png",
                        hash: "hash-1",
                    },
                ],
            });
            expect(result).toEqual(mockResponse);
        });

        test("media.createSpeech uses the audio output type with tts media kind", async () => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ taskId: "task-speech" }),
            });

            await ConciergeSDK.media.createSpeech({
                prompt: "Say hello",
                voiceName: "Aoede",
            });

            expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
                appletId: "abc123",
                operation: "create-media",
                outputType: "audio",
                mediaKind: "tts",
                prompt: "Say hello",
                voiceName: "Aoede",
            });
        });

        test("media helpers validate required fields before fetching", async () => {
            await expect(ConciergeSDK.media.transcribe({})).rejects.toThrow(
                "url or fileId is required",
            );
            await expect(
                ConciergeSDK.media.translateSubtitles({ text: "hello" }),
            ).rejects.toThrow("to is required");
            expect(global.fetch).not.toHaveBeenCalled();
        });
    });

    describe("tasks namespace", () => {
        beforeEach(() => {
            const meta = document.createElement("meta");
            meta.name = "applet-id";
            meta.content = "abc123";
            document.head.appendChild(meta);
        });

        test("tasks.get calls the guarded applet task endpoint", async () => {
            const taskId = "507f191e810c19729de860eb";
            const mockTask = {
                _id: taskId,
                status: "completed",
                data: "done",
            };
            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockTask),
            });

            const result = await ConciergeSDK.tasks.get(taskId);

            expect(global.fetch).toHaveBeenCalledWith(
                `/api/applet/tasks/${taskId}?appletId=abc123`,
                {
                    method: "GET",
                    credentials: "include",
                },
            );
            expect(result).toEqual(mockTask);
        });

        test("tasks.get rejects empty task IDs", async () => {
            await expect(ConciergeSDK.tasks.get("")).rejects.toThrow(
                "taskId must be a non-empty string",
            );
            expect(global.fetch).not.toHaveBeenCalled();
        });

        test("tasks.wait polls until completion", async () => {
            const taskId = "507f191e810c19729de860eb";
            const onProgress = jest.fn();
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            _id: taskId,
                            status: "in_progress",
                            progress: 0.5,
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            _id: taskId,
                            status: "completed",
                            data: { url: "https://example.com/out.png" },
                        }),
                });

            const result = await ConciergeSDK.tasks.wait(taskId, {
                intervalMs: 250,
                timeoutMs: 1000,
                onProgress,
            });

            expect(result.status).toBe("completed");
            expect(onProgress).toHaveBeenCalledTimes(2);
            expect(global.fetch).toHaveBeenCalledTimes(2);
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

            test("executePrompt aliases generate", async () => {
                global.fetch.mockResolvedValue({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            result: "done",
                            citations: [],
                            metadata: {},
                        }),
                });

                const result = await ConciergeSDK.models.executePrompt({
                    prompt: "Summarize this",
                });

                expect(global.fetch).toHaveBeenCalledWith(
                    "/api/applet/model-generate",
                    expect.objectContaining({
                        method: "POST",
                    }),
                );
                expect(result).toEqual({
                    result: "done",
                    citations: [],
                    metadata: {},
                });
            });

            test("generate works when detached from models object", async () => {
                global.fetch.mockResolvedValue({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            result: "done",
                            citations: [],
                            metadata: {},
                        }),
                });

                const { generate } = ConciergeSDK.models;
                const result = await generate({
                    prompt: "Summarize this",
                });

                expect(global.fetch).toHaveBeenCalledWith(
                    "/api/applet/model-generate",
                    expect.objectContaining({
                        method: "POST",
                    }),
                );
                expect(result).toEqual({
                    result: "done",
                    citations: [],
                    metadata: {},
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
