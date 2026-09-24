/**
 * @jest-environment node
 */

import {
    createGraphqlProgressSseResponse,
    extractTextFromProgressData,
} from "../graphql-progress-sse";

jest.mock("../../../../src/graphql", () => ({
    SUBSCRIPTIONS: {
        REQUEST_PROGRESS: { kind: "Document", definitions: [] },
    },
}));

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

describe("createGraphqlProgressSseResponse", () => {
    test("closes abandoned streams after the timeout and unsubscribes", async () => {
        const unsubscribe = jest.fn();
        const response = createGraphqlProgressSseResponse({
            timeoutMs: 20,
            timeoutMessage: "Source Q&A request timed out before completion",
            run: async ({ subscribeToRequestProgress }) => {
                subscribeToRequestProgress(
                    {
                        subscribe: () => ({
                            subscribe: () => ({ unsubscribe }),
                        }),
                    },
                    "request-hang",
                    {},
                );
            },
        });

        const body = await readStreamBody(response);

        expect(response.headers.get("Content-Type")).toBe("text/event-stream");
        expect(body).toContain('"event":"error"');
        expect(body).toContain(
            "Source Q&A request timed out before completion",
        );
        expect(unsubscribe).toHaveBeenCalled();
    });

    test("extracts OpenAI delta, content, and message payloads", () => {
        expect(
            extractTextFromProgressData(
                JSON.stringify({
                    choices: [{ delta: { content: "Hello " } }],
                }),
            ),
        ).toBe("Hello ");
        expect(
            extractTextFromProgressData(JSON.stringify({ content: "world" })),
        ).toBe("world");
        expect(
            extractTextFromProgressData(
                JSON.stringify({ message: "final answer" }),
            ),
        ).toBe("final answer");
        expect(
            extractTextFromProgressData(JSON.stringify({ citations: [] })),
        ).toBe("");
    });

    test("emits SSE comments so idle proxies keep the stream open", async () => {
        const response = createGraphqlProgressSseResponse({
            timeoutMs: 80,
            keepAliveMs: 20,
            timeoutMessage: "timed out",
            run: async () => {},
        });

        const body = await readStreamBody(response);
        expect(body).toContain(": keepalive");
    });
});
