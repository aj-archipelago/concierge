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

describe("POST /api/home/classify-add", () => {
    beforeEach(() => {
        mockQuery.mockReset();
    });

    test("returns 400 when prompt is missing", async () => {
        const response = await POST(makeRequest({}));
        expect(response.status).toBe(400);
    });

    test("returns LLM classification when available", async () => {
        mockQuery.mockResolvedValue({
            data: {
                run_workspace_prompt: {
                    result: JSON.stringify({
                        kind: "automation",
                        reason: "Mentions a daily schedule.",
                    }),
                },
            },
        });

        const response = await POST(
            makeRequest({ prompt: "daily news brief every morning" }),
        );
        const body = await response.json();
        expect(body.classification).toEqual({
            kind: "automation",
            reason: "Mentions a daily schedule.",
        });
    });

    test("falls back to heuristic when cortex fails", async () => {
        mockQuery.mockRejectedValue(new Error("cortex down"));

        const response = await POST(
            makeRequest({ prompt: "weekly digest of unread emails" }),
        );
        const body = await response.json();
        expect(body.classification.kind).toBe("automation");
        expect(typeof body.classification.reason).toBe("string");
    });

    test("defaults ambiguous prompts to applet via heuristic", async () => {
        mockQuery.mockRejectedValue(new Error("cortex down"));

        const response = await POST(
            makeRequest({ prompt: "a translator for Arabic headlines" }),
        );
        const body = await response.json();
        expect(body.classification.kind).toBe("applet");
    });
});
