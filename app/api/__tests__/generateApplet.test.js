/**
 * @jest-environment node
 */

import { POST } from "../generate-applet/route";

const mockQuery = jest.fn();
const mockUnsubscribe = jest.fn();

/** Mutable subscription payload; name starts with mock for Jest hoist rules */
const mockSseState = {
    subscriptionHtml: "<html><head></head><body>Hi</body></html>",
    subscriptionEvents: null,
    eventsByRequestId: null,
};

jest.mock("../../../src/graphql", () => {
    const { SUBSCRIPTIONS } = jest.requireActual("../../../src/graphql");
    return {
        SUBSCRIPTIONS,
        getClient: () => ({
            query: mockQuery,
            subscribe: ({ variables } = {}) => ({
                subscribe: (handlers) => {
                    queueMicrotask(() => {
                        const requestId = variables?.requestIds?.[0];
                        const events = mockSseState.eventsByRequestId?.[
                            requestId
                        ] ||
                            mockSseState.subscriptionEvents || [
                                {
                                    progress: 1,
                                    data: mockSseState.subscriptionHtml,
                                    error: null,
                                },
                            ];

                        for (const event of events) {
                            if (event.type === "subscriptionError") {
                                handlers.error(new Error(event.message));
                                return;
                            }
                            if (event.type === "complete") {
                                handlers.complete?.();
                                return;
                            }

                            handlers.next({
                                data: {
                                    requestProgress: event,
                                },
                            });
                        }
                    });
                    return { unsubscribe: mockUnsubscribe };
                },
            }),
        }),
    };
});

jest.mock("../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../../../config", () => ({
    __esModule: true,
    default: {
        cortex: { defaultChatModel: "oai-gpt4o" },
    },
}));

function createRequest(body) {
    return {
        json: () => Promise.resolve(body),
    };
}

async function readGenerateAppletResult(res) {
    const ct = res.headers.get("content-type");
    if (ct?.includes("application/json")) {
        return res.json();
    }

    const text = await res.text();
    const events = [];
    for (const block of text.split("\n\n")) {
        for (const line of block.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
                events.push(JSON.parse(line.slice(6)));
            } catch {
                // Ignore malformed chunks in test harness.
            }
        }
    }

    const complete = events.find((event) => event.event === "complete");
    if (!complete) {
        const errorEvent = events.find((event) => event.event === "error");
        throw new Error(
            errorEvent
                ? `SSE error: ${JSON.stringify(errorEvent.data)}`
                : "no complete event in SSE body",
        );
    }

    return complete.data;
}

async function readGenerateAppletEvents(res) {
    const text = await res.text();
    const events = [];
    for (const block of text.split("\n\n")) {
        for (const line of block.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
                events.push(JSON.parse(line.slice(6)));
            } catch {
                // Ignore malformed chunks in test harness.
            }
        }
    }
    return events;
}

describe("generate-applet API", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSseState.subscriptionHtml =
            "<html><head></head><body>Hi</body></html>";
        mockSseState.subscriptionEvents = null;
        mockSseState.eventsByRequestId = null;
        const { getCurrentUser } = require("../utils/auth");
        getCurrentUser.mockResolvedValue({ contextId: "user-1" });
        mockQuery.mockResolvedValue({
            data: {
                run_workspace_prompt: {
                    result: "test-subscription-id",
                },
            },
        });
    });

    test("returns 400 when prompt is empty", async () => {
        const res = await POST(createRequest({ prompt: "" }));
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toBe("Prompt is required");
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test.each([undefined, "widget"])(
        "flags unexpected Source Q&A use without retrying (%s)",
        async (formFactor) => {
            mockSseState.subscriptionHtml =
                '<html><script>ConciergeSDK["sourceQa"].query({text:"news"})</script></html>';
            const res = await POST(
                createRequest({ prompt: "A news dashboard", formFactor }),
            );
            const events = await readGenerateAppletEvents(res);
            expect(events).toContainEqual(
                expect.objectContaining({
                    event: "error",
                    data: expect.objectContaining({
                        code: "APPLET_SOURCE_QA_REVIEW_REQUIRED",
                    }),
                }),
            );
            expect(events.some((event) => event.event === "complete")).toBe(
                false,
            );
            expect(mockQuery).toHaveBeenCalledTimes(1);
            const system = JSON.parse(
                mockQuery.mock.calls[0][0].variables.chatHistory[0].content[0],
            ).text;
            expect(system).not.toMatch(/ask.?aj|specialistSkill/i);
            expect(system).not.toContain("options.maxRefinementRounds");
        },
    );

    test("cannot re-enable Source Q&A with the retired specialist opt-in", async () => {
        mockSseState.subscriptionHtml =
            '<html><script>ConciergeSDK.sourceQa.query({text:"news"})</script></html>';
        const res = await POST(
            createRequest({
                prompt: "Build the Source Q&A experience",
                specialistSkill: "source-qa",
            }),
        );
        const events = await readGenerateAppletEvents(res);
        expect(events).toContainEqual(
            expect.objectContaining({
                event: "error",
                data: expect.objectContaining({
                    code: "APPLET_SOURCE_QA_REVIEW_REQUIRED",
                }),
            }),
        );
        expect(events.some((event) => event.event === "complete")).toBe(false);
        const system = JSON.parse(
            mockQuery.mock.calls[0][0].variables.chatHistory[0].content[0],
        ).text;
        expect(system).not.toMatch(/ask.?aj|specialistSkill/i);
        expect(system).not.toContain("options.maxRefinementRounds");
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    test("prefers the cortex-default-coding model group for applet generation when the default model is weaker", async () => {
        const res = await POST(createRequest({ prompt: "A calculator" }));
        const data = await readGenerateAppletResult(res);

        expect(res.status).toBe(200);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                variables: expect.objectContaining({
                    model: "cortex-default-coding",
                    reasoningEffort: "low",
                }),
            }),
        );
        expect(data.html).toBeDefined();
    });

    test("keeps real transcription requirements in the applet generation prompt", async () => {
        const res = await POST(
            createRequest({ prompt: "Create a transcription applet" }),
        );
        await readGenerateAppletResult(res);

        const chatHistory = mockQuery.mock.calls[0][0].variables.chatHistory;
        const systemMessage = JSON.parse(chatHistory[0].content[0]).text;
        expect(systemMessage).toContain("ConciergeSDK.media.transcribe");
        expect(systemMessage).toContain("ConciergeSDK.tasks.get");
        expect(systemMessage).toContain("never invent/sample transcript text");
        expect(systemMessage).toContain("media preview");
        expect(systemMessage).toContain("progress/status");
        expect(systemMessage).toContain("Do NOT use `@apply`");
        expect(systemMessage).not.toContain("Canvas Applet Tools");
        expect(systemMessage).not.toContain("# Applets Skill");
    });

    test("adds compact home-widget guidance when formFactor is widget", async () => {
        const res = await POST(
            createRequest({
                prompt: "A translator for Arabic headlines",
                formFactor: "widget",
            }),
        );
        await readGenerateAppletResult(res);

        const chatHistory = mockQuery.mock.calls[0][0].variables.chatHistory;
        const systemMessage = JSON.parse(chatHistory[0].content[0]).text;
        const userMessage = JSON.parse(chatHistory[1].content[0]).text;
        expect(systemMessage).toContain("HOME WIDGET DESIGN CONTRACT");
        expect(systemMessage).toContain("ConciergeSDK.locale.getLanguage()");
        expect(systemMessage).toContain("ConciergeSDK.media.ensureImage");
        expect(userMessage).toContain("Arabic");
        expect(userMessage).toContain("A translator for Arabic headlines");
        expect(systemMessage).not.toContain("Applets Skill");
        expect(systemMessage).toContain("ConciergeSDK.agent.render");
        expect(mockQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                variables: expect.objectContaining({
                    reasoningEffort: "medium",
                }),
            }),
        );
    });

    test("includes current HTML when modifying an existing applet", async () => {
        const res = await POST(
            createRequest({
                prompt: "Make the title larger",
                formFactor: "widget",
                currentHtml: "<html><body>Toronto weather</body></html>",
            }),
        );
        await readGenerateAppletResult(res);

        const chatHistory = mockQuery.mock.calls[0][0].variables.chatHistory;
        const userMessage = JSON.parse(chatHistory[1].content[0]).text;
        expect(userMessage).toContain("Here is the current HTML of the applet");
        expect(userMessage).toContain(
            "<html><body>Toronto weather</body></html>",
        );
        expect(userMessage).toContain("Make the title larger");
        expect(userMessage).toContain("readable hierarchy");
        expect(userMessage).toContain("light/dark themes");
    });

    test("compacts oversized widget source HTML before sending it to the model", async () => {
        const bulkyHtml = `<html><body><img src="data:image/png;base64,${"A".repeat(800)}"><p>${"x".repeat(41000)}</p></body></html>`;
        const res = await POST(
            createRequest({
                prompt: "Make a compact widget",
                formFactor: "widget",
                currentHtml: bulkyHtml,
            }),
        );
        await readGenerateAppletResult(res);

        const chatHistory = mockQuery.mock.calls[0][0].variables.chatHistory;
        const userMessage = JSON.parse(chatHistory[1].content[0]).text;
        expect(userMessage).not.toContain("AAAA");
        expect(userMessage).toContain("<!-- truncated -->");
        expect(userMessage.length).toBeLessThan(bulkyHtml.length);
    });

    test("compacts oversized full-page source HTML before sending it to the model", async () => {
        const bulkyHtml = `<html><body><img src="data:image/png;base64,${"A".repeat(800)}"><p>${"x".repeat(81000)}</p></body></html>`;
        const res = await POST(
            createRequest({
                prompt: "Make the title larger",
                currentHtml: bulkyHtml,
            }),
        );
        await readGenerateAppletResult(res);

        const chatHistory = mockQuery.mock.calls[0][0].variables.chatHistory;
        const userMessage = JSON.parse(chatHistory[1].content[0]).text;
        expect(userMessage).not.toContain("AAAA");
        expect(userMessage).toContain("<!-- truncated -->");
        expect(userMessage.length).toBeLessThan(bulkyHtml.length);
    });

    test("attaches a widget screenshot as a vision input", async () => {
        const screenshot = "data:image/jpeg;base64,abc123";
        const res = await POST(
            createRequest({
                prompt: "Make the type larger",
                formFactor: "widget",
                currentHtml: "<html><body>Widget</body></html>",
                screenshot,
            }),
        );
        await readGenerateAppletResult(res);

        const chatHistory = mockQuery.mock.calls[0][0].variables.chatHistory;
        const userParts = chatHistory[1].content.map((entry) =>
            JSON.parse(entry),
        );
        expect(userParts[0].text).toContain(
            "A screenshot or labeled contact sheet of the widget is attached",
        );
        expect(userParts[1]).toEqual(
            expect.objectContaining({
                type: "image_url",
                url: screenshot,
                image_url: { url: screenshot },
            }),
        );
    });

    test("ignores invalid widget screenshots", async () => {
        const res = await POST(
            createRequest({
                prompt: "Make the type larger",
                formFactor: "widget",
                currentHtml: "<html><body>Widget</body></html>",
                screenshot: "https://example.com/widget.png",
            }),
        );
        await readGenerateAppletResult(res);

        const chatHistory = mockQuery.mock.calls[0][0].variables.chatHistory;
        expect(chatHistory[1].content).toHaveLength(1);
        const userMessage = JSON.parse(chatHistory[1].content[0]).text;
        expect(userMessage).not.toContain(
            "A screenshot or labeled contact sheet of the widget is attached",
        );
    });

    test("keeps real media generation requirements in the applet generation prompt", async () => {
        const res = await POST(
            createRequest({ prompt: "Create an image generation applet" }),
        );
        await readGenerateAppletResult(res);

        const chatHistory = mockQuery.mock.calls[0][0].variables.chatHistory;
        const systemMessage = JSON.parse(chatHistory[0].content[0]).text;
        expect(systemMessage).toContain("ConciergeSDK.media.models");
        expect(systemMessage).toContain("ConciergeSDK.media.create");
        expect(systemMessage).toContain("ConciergeSDK.tasks.wait");
        expect(systemMessage).toContain("do not invent completed media URLs");
    });

    test("requires native citations for generated agent applets", async () => {
        const res = await POST(
            createRequest({ prompt: "Create a private knowledge applet" }),
        );
        await readGenerateAppletResult(res);

        const chatHistory = mockQuery.mock.calls[0][0].variables.chatHistory;
        const systemMessage = JSON.parse(chatHistory[0].content[0]).text;
        expect(systemMessage).toContain("ConciergeSDK.agent.render");
        expect(systemMessage).toContain(
            "Cite sourced claims with ordinary HTML links",
        );
        expect(systemMessage).toContain(
            "Never copy context facts into HTML/JavaScript",
        );
        expect(systemMessage).toContain(
            "Never build custom citation/source/reference chips",
        );
        expect(systemMessage).toContain(
            "Never put an agentContext ID in generated HTML or UI",
        );
    });

    test("rejects new applet HTML with citation markers in displayed prose", async () => {
        mockSseState.subscriptionHtml =
            "<html><body><p>Evidence :cd_source[abc-1]</p></body></html>";
        const res = await POST(createRequest({ prompt: "A sourced report" }));
        await expect(readGenerateAppletResult(res)).rejects.toThrow(
            "HTML_CITATION_FORMAT",
        );
    });

    test("falls back to config.cortex.defaultChatModel if the preferred model fails", async () => {
        mockQuery
            .mockRejectedValueOnce(new Error("unknown model"))
            .mockResolvedValueOnce({
                data: {
                    run_workspace_prompt: {
                        result: "fallback-subscription-id",
                    },
                },
            });

        const res = await POST(createRequest({ prompt: "A dashboard" }));
        await readGenerateAppletResult(res);

        expect(mockQuery).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                variables: expect.objectContaining({
                    model: "cortex-default-coding",
                    reasoningEffort: "low",
                }),
            }),
        );
        expect(mockQuery).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                variables: expect.objectContaining({
                    model: "oai-gpt4o",
                }),
            }),
        );
    });

    test("retries without reasoning effort when Cortex has an older run_workspace_prompt schema", async () => {
        mockQuery
            .mockRejectedValueOnce(
                new Error(
                    'Unknown argument "reasoningEffort" on field "Query.run_workspace_prompt".',
                ),
            )
            .mockResolvedValueOnce({
                data: {
                    run_workspace_prompt: {
                        result: "fallback-subscription-id",
                    },
                },
            });

        const res = await POST(createRequest({ prompt: "A map" }));
        await readGenerateAppletResult(res);

        expect(res.status).toBe(200);
        expect(mockQuery).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                variables: expect.objectContaining({
                    model: "cortex-default-coding",
                    reasoningEffort: "low",
                }),
            }),
        );
        expect(mockQuery).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                variables: expect.not.objectContaining({
                    reasoningEffort: expect.anything(),
                }),
            }),
        );
    });

    test("injects Tailwind and strips markdown fences from model output", async () => {
        mockSseState.subscriptionHtml =
            "```html\n<html><head></head><body>Content</body></html>\n```";

        const res = await POST(createRequest({ prompt: "A form" }));
        const data = await readGenerateAppletResult(res);

        expect(res.status).toBe(200);
        expect(data.html).toContain("@tailwindcss/browser");
        expect(data.html).toContain(
            '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>',
        );
        expect(data.html).not.toContain("```");
    });

    test("retries once when generation completes without HTML", async () => {
        mockQuery
            .mockResolvedValueOnce({
                data: {
                    run_workspace_prompt: {
                        result: "empty-subscription-id",
                    },
                },
            })
            .mockResolvedValueOnce({
                data: {
                    run_workspace_prompt: {
                        result: "retry-subscription-id",
                    },
                },
            });
        mockSseState.eventsByRequestId = {
            "empty-subscription-id": [
                {
                    progress: 1,
                    data: JSON.stringify({
                        choices: [{ delta: {}, finish_reason: "stop" }],
                    }),
                    error: null,
                },
            ],
            "retry-subscription-id": [
                {
                    progress: 1,
                    data: "<html><head></head><body>Retry worked</body></html>",
                    error: null,
                },
            ],
        };

        const res = await POST(createRequest({ prompt: "A Simon game" }));
        const data = await readGenerateAppletResult(res);

        expect(res.status).toBe(200);
        expect(mockQuery).toHaveBeenCalledTimes(2);
        expect(data.html).toContain("Retry worked");
    });

    test("returns SSE error when retry also completes without HTML", async () => {
        mockQuery
            .mockResolvedValueOnce({
                data: {
                    run_workspace_prompt: {
                        result: "empty-subscription-id",
                    },
                },
            })
            .mockResolvedValueOnce({
                data: {
                    run_workspace_prompt: {
                        result: "retry-empty-subscription-id",
                    },
                },
            });
        mockSseState.eventsByRequestId = {
            "empty-subscription-id": [
                {
                    progress: 1,
                    data: "",
                    error: null,
                },
            ],
            "retry-empty-subscription-id": [
                {
                    progress: 1,
                    data: JSON.stringify({
                        choices: [{ delta: {}, finish_reason: "stop" }],
                    }),
                    error: null,
                },
            ],
        };

        const res = await POST(createRequest({ prompt: "A broken applet" }));
        const events = await readGenerateAppletEvents(res);

        expect(res.status).toBe(200);
        expect(mockQuery).toHaveBeenCalledTimes(2);
        expect(events).toContainEqual({
            event: "error",
            data: {
                error: "Applet generation completed without HTML. Retried once.",
            },
        });
    });
});
