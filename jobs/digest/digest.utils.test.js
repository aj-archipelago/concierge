/**
 * @jest-environment node
 */

import { getClient } from "../graphql.mjs";
import {
    generateDigestBlockContent,
    getDigestLanguageInstruction,
} from "./digest.utils.js";

jest.mock("../graphql.mjs", () => ({
    __esModule: true,
    QUERIES: { SYS_ENTITY_AGENT: "SYS_ENTITY_AGENT" },
    SUBSCRIPTIONS: { REQUEST_PROGRESS: "REQUEST_PROGRESS" },
    MUTATIONS: { CANCEL_REQUEST: "CANCEL_REQUEST" },
    getClient: jest.fn(),
}));

jest.mock("../../src/utils/fileAccessPlanUtils.js", () => ({
    buildFileAccessPlan: jest.fn(() => ({ files: [] })),
    buildRunContext: jest.fn(() => ({
        contextId: "context-1",
        contextKey: "context-key-1",
    })),
}));

const completedClient = (query) => {
    const original = query.getMockImplementation();
    let output;
    query.mockImplementation(async (...args) => {
        const response = await original(...args);
        const field = Object.keys(response.data)[0];
        output = response.data[field].result;
        return {
            data: {
                [field]: { result: "e08c856a-4681-49a6-9ac2-3324ff1e9a79" },
            },
        };
    });
    return {
        query,
        subscribe: () => ({
            subscribe: (observer) => {
                observer.next({
                    data: {
                        requestProgress: {
                            progress: 1,
                            data: JSON.stringify(output),
                        },
                    },
                });
                return { unsubscribe: jest.fn() };
            },
        }),
        stop: jest.fn(),
    };
};

describe("digest generation language", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("adds the saved Arabic preference to the system instructions", async () => {
        const query = jest.fn().mockResolvedValue({
            data: {
                sys_entity_agent: {
                    result: "نتيجة عربية",
                    tool: null,
                },
            },
        });
        getClient.mockResolvedValue(completedClient(query));

        await generateDigestBlockContent(
            { _id: "block-1", prompt: "What's going on today?" },
            {
                _id: "user-1",
                contextId: "context-1",
                contextKey: "context-key-1",
            },
            { log: jest.fn() },
            jest.fn(),
            { language: "ar" },
        );

        const systemContent =
            query.mock.calls[0][0].variables.chatHistory[0].content;
        expect(systemContent).toContain(
            "Write the report in Arabic unless the user's request explicitly asks for a different language.",
        );
    });

    it("does not force a language when no saved preference exists", () => {
        expect(getDigestLanguageInstruction(null)).toBeNull();
        expect(getDigestLanguageInstruction("fr")).toBeNull();
    });

    it("preserves an explicit language request in the user's prompt", async () => {
        const query = jest.fn().mockResolvedValue({
            data: {
                sys_entity_agent: { result: "English result", tool: null },
            },
        });
        getClient.mockResolvedValue(completedClient(query));
        const prompt = "اكتب هذا التقرير باللغة الإنجليزية";

        await generateDigestBlockContent(
            { _id: "block-1", prompt },
            { _id: "user-1", contextId: "context-1" },
            { log: jest.fn() },
            jest.fn(),
            { language: "ar" },
        );

        const chatHistory = query.mock.calls[0][0].variables.chatHistory;
        expect(chatHistory[0].content).toContain(
            "Write the report in Arabic unless the user's request explicitly asks for a different language.",
        );
        expect(chatHistory[1]).toEqual({
            role: "user",
            content: [prompt],
        });
    });
});

describe("digest asynchronous completion", () => {
    const user = { _id: "user-1" };
    const block = { _id: "block-1", prompt: "Daily report" };
    const requestId = "e08c856a-4681-49a6-9ac2-3324ff1e9a79";
    let observer;
    let client;
    let logger;

    beforeEach(() => {
        jest.useFakeTimers();
        logger = { log: jest.fn() };
        client = {
            query: jest.fn().mockResolvedValue({
                data: {
                    sys_entity_agent: { result: requestId },
                },
            }),
            subscribe: jest.fn(() => ({
                subscribe: (handlers) => {
                    observer = handlers;
                    return { unsubscribe: jest.fn() };
                },
            })),
            mutate: jest.fn().mockResolvedValue({}),
            stop: jest.fn(),
        };
        getClient.mockResolvedValue(client);
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    it("waits beyond the four-minute HTTP boundary and saves only final content", async () => {
        const progress = jest.fn();
        const pending = generateDigestBlockContent(
            block,
            user,
            logger,
            progress,
        );
        await jest.advanceTimersByTimeAsync(240100);
        expect(client.query.mock.calls[0][0].variables.async).toBe(true);
        expect(observer).toBeDefined();
        observer.next({
            data: {
                requestProgress: {
                    progress: 0.5,
                    data: JSON.stringify("Working..."),
                },
            },
        });
        observer.next({
            data: {
                requestProgress: {
                    progress: 1,
                    data: JSON.stringify("Finished report"),
                    info: JSON.stringify({
                        citations: ["source"],
                        usage: { total: 10 },
                    }),
                },
            },
        });
        const content = JSON.parse(await pending);
        expect(content.payload).toBe("Finished report");
        expect(JSON.parse(content.tool)).toEqual({ citations: ["source"] });
        expect(progress).toHaveBeenLastCalledWith(100);
        expect(client.stop).toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    });

    it("propagates HTTP errors instead of returning them as digest content", async () => {
        client.query.mockRejectedValue(new Error("Received status code 504"));
        await expect(
            generateDigestBlockContent(block, user, logger, jest.fn()),
        ).rejects.toThrow("504");
        expect(jest.getTimerCount()).toBe(0);
    });
});
