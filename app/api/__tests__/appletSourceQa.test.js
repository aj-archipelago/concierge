/**
 * @jest-environment node
 */

import { NextResponse } from "next/server";
import { POST } from "../applet/source-qa/route";

const mockQuery = jest.fn();
const mockSubscribe = jest.fn();
const mockValidateAppletAccess = jest.fn();
const mockWithAppletSdkGuard = jest.fn(async ({ run }) => run());

jest.mock("../../../src/graphql", () => {
    return {
        getClient: () => ({
            query: mockQuery,
            subscribe: mockSubscribe,
        }),
        QUERIES: {
            SOURCE_QA: { kind: "Document", definitions: [] },
        },
        SUBSCRIPTIONS: {
            REQUEST_PROGRESS: { kind: "Document", definitions: [] },
        },
    };
});

jest.mock("../utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../applet/access.js", () => ({
    validateAppletAccess: (...args) => mockValidateAppletAccess(...args),
}));

jest.mock("../applet/sdk-guard.js", () => ({
    APPLET_SDK_LIMITS: {
        sourceQa: { concurrent: 3, maxPerWindow: 12, windowMs: 60000 },
    },
    withAppletSdkGuard: (...args) => mockWithAppletSdkGuard(...args),
}));

function createRequest(body) {
    return {
        json: () =>
            Promise.resolve({
                appletId: "507f191e810c19729de860ea",
                ...body,
            }),
    };
}

async function readStreamBody(res) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
    return text;
}

describe("POST /api/applet/source-qa", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const { getCurrentUser } = require("../utils/auth");
        getCurrentUser.mockResolvedValue({
            _id: "user-1",
            contextId: "user-ctx-1",
            contextKey: "user-key-1",
        });
        mockValidateAppletAccess.mockResolvedValue(null);
        mockSubscribe.mockReset();
        mockQuery.mockResolvedValue({
            data: {
                ask_aj: {
                    result: "request-default",
                    resultData: null,
                    tool: null,
                    warnings: ["careful"],
                    errors: [],
                },
            },
        });
        mockSubscribe.mockReturnValue({
            subscribe: (observer) => {
                queueMicrotask(() => {
                    observer.next({
                        data: {
                            requestProgress: {
                                progress: 0.65,
                                info: JSON.stringify({
                                    citations: [
                                        {
                                            title: "Early source",
                                            url: "https://example.com/early",
                                        },
                                    ],
                                    confidence: "high",
                                    coverage: {
                                        adequate: true,
                                        answerableWithCaveat: false,
                                        clarificationRequired: false,
                                    },
                                    partial: true,
                                    phase: "retrieval_complete",
                                }),
                            },
                        },
                    });
                    observer.next({
                        data: {
                            requestProgress: {
                                progress: 1,
                                data: JSON.stringify({
                                    choices: [
                                        {
                                            delta: {
                                                content:
                                                    "Answer with citation :cd_source[1]",
                                            },
                                        },
                                    ],
                                }),
                                info: JSON.stringify({
                                    citations: [
                                        {
                                            title: "Source",
                                            url: "https://example.com/source",
                                        },
                                    ],
                                    searchResults: [
                                        {
                                            title: "Source",
                                            url: "https://example.com/source",
                                        },
                                    ],
                                    followUpQuestions: [
                                        "What should we watch next?",
                                        "Who are the key players?",
                                    ],
                                    confidence: "high",
                                    coverage: {
                                        adequate: true,
                                        answerableWithCaveat: false,
                                        clarificationRequired: false,
                                    },
                                    timings: { totalMs: 1234 },
                                }),
                            },
                        },
                    });
                });
                return { unsubscribe: jest.fn() };
            },
        });
    });

    test("returns 400 when text is missing", async () => {
        const res = await POST(createRequest({}));
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toBe("text is required");
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test("passes variables to the source Q&A GraphQL endpoint", async () => {
        const res = await POST(
            createRequest({
                text: "How is the US doing in the world cup?",
                contextInfo: {
                    topic: "US soccer",
                    previousQuestion:
                        "What's going on with the US soccer team?",
                    previousAnswer:
                        "The USMNT is preparing for the 2026 World Cup.",
                    turns: [
                        {
                            role: "user",
                            content: "What's going on with the US soccer team?",
                        },
                        {
                            role: "assistant",
                            content:
                                "The USMNT is preparing for the 2026 World Cup.",
                        },
                    ],
                    notes: ["The next user question is a follow-up."],
                },
                language: "English",
                maxSearchResults: 16,
                maxRefinementRounds: 1,
                searchInternet: false,
                maxInternetResults: 3,
                followUpQuestionCount: 4,
                skipAnswerSynthesis: true,
            }),
        );

        expect(res.status).toBe(200);
        expect(mockWithAppletSdkGuard).toHaveBeenCalledWith(
            expect.objectContaining({
                appletId: "507f191e810c19729de860ea",
                userId: "user-1",
                api: "sourceQa.query",
            }),
        );
        expect(mockQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                query: expect.objectContaining({ kind: "Document" }),
                variables: {
                    text: "How is the US doing in the world cup?",
                    contextInfo: [
                        "Current topic: US soccer",
                        "Previous question: What's going on with the US soccer team?",
                        "Previous answer: The USMNT is preparing for the 2026 World Cup.",
                        "Prior conversation:",
                        "user: What's going on with the US soccer team?",
                        "assistant: The USMNT is preparing for the 2026 World Cup.",
                        "Additional context:",
                        "The next user question is a follow-up.",
                    ].join("\n"),
                    language: "English",
                    maxSearchResults: 16,
                    maxRefinementRounds: 1,
                    searchInternet: false,
                    maxInternetResults: 3,
                    followUpQuestionCount: 4,
                    skipAnswerSynthesis: true,
                    stream: true,
                },
                fetchPolicy: "network-only",
            }),
        );
    });

    test("returns parsed complete source Q&A result data", async () => {
        const res = await POST(
            createRequest({
                text: "How is the US doing in the world cup?",
            }),
        );
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.result).toBe("Answer with citation :cd_source[1]");
        expect(data.citations).toEqual([
            { title: "Source", url: "https://example.com/source" },
        ]);
        expect(data.followUpQuestions).toEqual([
            "What should we watch next?",
            "Who are the key players?",
        ]);
        expect(data.confidence).toBe("high");
        expect(data.coverage).toEqual({
            adequate: true,
            answerableWithCaveat: false,
            clarificationRequired: false,
        });
        expect(data.resultData).toMatchObject({
            confidence: "high",
            coverage: {
                adequate: true,
                answerableWithCaveat: false,
                clarificationRequired: false,
            },
            followUpQuestions: [
                "What should we watch next?",
                "Who are the key players?",
            ],
            timings: { totalMs: 1234 },
        });
        expect(data.metadata).toEqual(data.resultData);
        expect(data.tool).toEqual({});
        expect(data.rawResultData).toEqual(expect.any(String));
        expect(data.rawTool).toBeNull();
        expect(data.warnings).toEqual(["careful"]);
        expect(data.errors).toEqual([]);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                variables: expect.objectContaining({
                    language: "auto",
                    stream: true,
                }),
            }),
        );
    });

    test("accepts question as an alias for text", async () => {
        await POST(createRequest({ question: "What happened?" }));

        expect(mockQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                variables: expect.objectContaining({
                    text: "What happened?",
                }),
            }),
        );
    });

    test("returns access errors before calling GraphQL", async () => {
        mockValidateAppletAccess.mockResolvedValueOnce(
            NextResponse.json({ error: "Access denied" }, { status: 403 }),
        );

        const res = await POST(createRequest({ text: "Hello" }));
        const data = await res.json();

        expect(res.status).toBe(403);
        expect(data.error).toBe("Access denied");
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test("streams source Q&A chunks and completes with parsed metadata", async () => {
        const unsubscribe = jest.fn();
        mockQuery.mockResolvedValueOnce({
            data: {
                ask_aj: {
                    result: "request-1",
                    resultData: null,
                    tool: null,
                    warnings: [],
                    errors: [],
                },
            },
        });
        mockSubscribe.mockReturnValueOnce({
            subscribe: (observer) => {
                queueMicrotask(() => {
                    observer.next({
                        data: {
                            requestProgress: {
                                progress: 0.65,
                                info: JSON.stringify({
                                    citations: [
                                        {
                                            title: "Early source",
                                            url: "https://example.com/early",
                                        },
                                    ],
                                    confidence: "high",
                                    coverage: {
                                        adequate: true,
                                        answerableWithCaveat: false,
                                        clarificationRequired: false,
                                    },
                                    partial: true,
                                    phase: "retrieval_complete",
                                }),
                            },
                        },
                    });
                    observer.next({
                        data: {
                            requestProgress: {
                                progress: 0.5,
                                data: JSON.stringify({
                                    choices: [{ delta: { content: "Hello" } }],
                                }),
                            },
                        },
                    });
                    observer.next({
                        data: {
                            requestProgress: {
                                progress: 1,
                                info: JSON.stringify({
                                    citations: [
                                        {
                                            title: "Source",
                                            url: "https://example.com/source",
                                        },
                                    ],
                                    confidence: "medium",
                                    coverage: {
                                        adequate: true,
                                        answerableWithCaveat: true,
                                        clarificationRequired: false,
                                    },
                                    followUpQuestions: ["What next?"],
                                }),
                            },
                        },
                    });
                });
                return { unsubscribe };
            },
        });

        const res = await POST(
            createRequest({
                text: "How is the US doing in the world cup?",
                stream: true,
            }),
        );
        const body = await readStreamBody(res);

        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toBe("text/event-stream");
        expect(mockQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                variables: expect.objectContaining({
                    stream: true,
                }),
            }),
        );
        expect(mockSubscribe).toHaveBeenCalledWith(
            expect.objectContaining({
                variables: { requestIds: ["request-1"] },
            }),
        );
        expect(body).toContain('"event":"data"');
        expect(body).toContain('"chunk":"Hello"');
        expect(body).toContain('"event":"metadata"');
        expect(body).toContain('"phase":"retrieval_complete"');
        expect(body).toContain('"metadata":{"result":""');
        expect(body).toContain('"event":"complete"');
        expect(body).toContain('"confidence":"medium"');
        expect(body).toContain('"coverage":{"adequate":true');
        expect(body).toContain('"citations":[{"title":"Source"');
        expect(unsubscribe).toHaveBeenCalled();
    });
});
