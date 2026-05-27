/**
 * @jest-environment node
 */

const mockQuery = jest.fn();

jest.mock("../../../../src/graphql", () => ({
    getClient: () => ({ query: mockQuery }),
    QUERIES: {
        getWorkspacePromptQuery: jest.fn(() => ({})),
    },
}));

jest.mock("../../utils/auth", () => ({
    getCurrentUser: jest.fn(async () => ({
        _id: "user-1",
        contextId: "ctx-1",
        contextKey: "key-1",
    })),
    handleError: (error) =>
        new Response(JSON.stringify({ error: error.message }), { status: 500 }),
}));

jest.mock("../../utils/llm-file-utils", () => ({
    buildWorkspacePromptVariables: jest.fn(async () => ({
        chatHistory: [],
    })),
}));

jest.mock("../../../../config", () => ({
    __esModule: true,
    default: { cortex: { defaultChatModel: "test-model" } },
}));

const { POST } = require("./route");

function makeRequest(body) {
    return {
        json: async () => body,
    };
}

describe("POST /api/automations/suggest", () => {
    beforeEach(() => {
        mockQuery.mockReset();
    });

    test("returns 400 when prompt is missing", async () => {
        const response = await POST(makeRequest({}));
        expect(response.status).toBe(400);
    });

    test("normalizes and returns a parsed suggestion", async () => {
        mockQuery.mockResolvedValue({
            data: {
                run_workspace_prompt: {
                    result: JSON.stringify({
                        name: "Daily project brief",
                        description:
                            "A quick project status summary every weekday.",
                        schedulePreset: "weekday-mornings",
                        producesHtml: true,
                        contentMarkdown: "# Daily news brief\n\nDo it.\n",
                    }),
                },
            },
        });

        const response = await POST(
            makeRequest({
                prompt: "every weekday at 8am give me a project brief",
            }),
        );
        const body = await response.json();
        expect(body.suggestion).toEqual({
            name: "Daily project brief",
            description: "A quick project status summary every weekday.",
            schedulePreset: "weekday-mornings",
            producesHtml: true,
            contentMarkdown: "# Daily news brief\n\nDo it.\n",
        });
    });

    test("falls back to manual preset when LLM returns invalid preset", async () => {
        mockQuery.mockResolvedValue({
            data: {
                run_workspace_prompt: {
                    result: JSON.stringify({
                        name: "Test",
                        schedulePreset: "bogus-preset",
                    }),
                },
            },
        });

        const response = await POST(makeRequest({ prompt: "Test prompt" }));
        const body = await response.json();
        expect(body.suggestion.schedulePreset).toBe("manual");
    });

    test("extracts JSON from a fenced code block", async () => {
        mockQuery.mockResolvedValue({
            data: {
                run_workspace_prompt: {
                    result: 'Sure! Here you go:\n```json\n{"name":"X","schedulePreset":"manual"}\n```\n',
                },
            },
        });

        const response = await POST(makeRequest({ prompt: "anything" }));
        const body = await response.json();
        expect(body.suggestion.name).toBe("X");
    });

    test("returns suggestion: null on Cortex failure", async () => {
        mockQuery.mockRejectedValue(new Error("cortex down"));

        const response = await POST(makeRequest({ prompt: "anything" }));
        const body = await response.json();
        expect(body.suggestion).toBeNull();
    });
});
