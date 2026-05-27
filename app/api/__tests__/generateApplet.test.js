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

    test("prefers the cortex-default-coding model group for applet generation when the default model is weaker", async () => {
        const res = await POST(createRequest({ prompt: "A calculator" }));
        const data = await readGenerateAppletResult(res);

        expect(res.status).toBe(200);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                variables: expect.objectContaining({
                    model: "cortex-default-coding",
                    reasoningEffort: "medium",
                }),
            }),
        );
        expect(data.html).toBeDefined();
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
                    reasoningEffort: "medium",
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
                    reasoningEffort: "medium",
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
