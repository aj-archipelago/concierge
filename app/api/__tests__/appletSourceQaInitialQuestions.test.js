/**
 * @jest-environment node
 */

import { NextResponse } from "next/server";
import { POST } from "../applet/source-qa/initial-questions/route";

const mockQuery = jest.fn();
const mockValidateAppletAccess = jest.fn();
const mockWithAppletSdkGuard = jest.fn(async ({ run }) => run());

jest.mock("../../../src/graphql", () => {
    return {
        getClient: () => ({
            query: mockQuery,
        }),
        QUERIES: {
            SOURCE_QA_INITIAL_QUESTIONS: { kind: "Document", definitions: [] },
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

describe("POST /api/applet/source-qa/initial-questions", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const { getCurrentUser } = require("../utils/auth");
        getCurrentUser.mockResolvedValue({
            _id: "user-1",
            contextId: "user-ctx-1",
            contextKey: "user-key-1",
        });
        mockValidateAppletAccess.mockResolvedValue(null);
        mockQuery.mockResolvedValue({
            data: {
                ask_aj_initial_questions: {
                    result: JSON.stringify({
                        language: "en",
                        sets: [["Question 1?", "Question 2?", "Question 3?"]],
                        questions: [
                            {
                                question: "Question 1?",
                                answerCacheKey: "askaj:answer:v1:abc",
                            },
                        ],
                        cache: { hit: false },
                    }),
                    warnings: [],
                    errors: [],
                },
            },
        });
    });

    test("returns 400 when appletId is missing", async () => {
        const res = await POST({ json: () => Promise.resolve({}) });
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toBe("appletId is required");
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test("passes normalized variables to Cortex starter pathway", async () => {
        const res = await POST(
            createRequest({
                language: "Arabic",
                prewarmAnswers: false,
            }),
        );
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.language).toBe("en");
        expect(data.questions[0].answerCacheKey).toBe("askaj:answer:v1:abc");
        expect(mockWithAppletSdkGuard).toHaveBeenCalledWith(
            expect.objectContaining({
                appletId: "507f191e810c19729de860ea",
                userId: "user-1",
                api: "sourceQa.initialQuestions",
            }),
        );
        expect(mockQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                query: expect.objectContaining({ kind: "Document" }),
                variables: {
                    language: "ar",
                    prewarmAnswers: false,
                },
                fetchPolicy: "network-only",
            }),
        );
    });

    test("returns access errors before calling GraphQL", async () => {
        mockValidateAppletAccess.mockResolvedValueOnce(
            NextResponse.json({ error: "Access denied" }, { status: 403 }),
        );

        const res = await POST(createRequest({ language: "en" }));
        const data = await res.json();

        expect(res.status).toBe(403);
        expect(data.error).toBe("Access denied");
        expect(mockQuery).not.toHaveBeenCalled();
    });
});
