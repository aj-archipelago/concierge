/**
 * @jest-environment jsdom
 */

/* eslint-disable import/first */
import { ReadableStream } from "node:stream/web";

/* Web Streams APIs are available in Node 18+ but not exposed by jsdom */
global.ReadableStream = ReadableStream;
global.Response = class Response {
    constructor(body) {
        this._body = body;
    }
    get body() {
        return this._body;
    }
};

import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useStreamingMessages } from "../useStreamingMessages";

jest.mock("react-toastify", () => ({
    toast: { error: jest.fn() },
}));

jest.mock("../../utils/clientSideTools", () => ({
    CLIENT_SIDE_TOOLS: [],
}));

// Run requestAnimationFrame synchronously so processQueue flushes inline
const origRAF = global.requestAnimationFrame;
const origCancelRAF = global.cancelAnimationFrame;
beforeEach(() => {
    global.requestAnimationFrame = (cb) => {
        cb();
        return 0;
    };
    global.cancelAnimationFrame = jest.fn();
});
afterEach(() => {
    global.requestAnimationFrame = origRAF;
    global.cancelAnimationFrame = origCancelRAF;
});

/**
 * Creates a controllable SSE stream that can be fed events from tests.
 */
function createMockSSEStream() {
    let controller;
    const stream = new ReadableStream({
        start(c) {
            controller = c;
        },
    });
    const encoder = new TextEncoder();
    return {
        response: new Response(stream),
        pushEvent(event, data) {
            controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ event, data })}\n\n`),
            );
        },
        close() {
            controller.close();
        },
        error(error = new Error("stream failed")) {
            controller.error(error);
        },
    };
}

/**
 * Flush microtasks / pending promises so the reader loop can advance.
 */
const flush = () => act(() => new Promise((r) => setTimeout(r, 10)));

describe("useStreamingMessages – endStream cache write", () => {
    let queryClient;

    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        jest.clearAllMocks();
    });

    afterEach(() => {
        queryClient.clear();
    });

    /**
     * Helper: render the hook for a given chatId.
     * The chat object matches the minimal shape the hook expects.
     */
    const renderStreamHook = (chatId, options = {}) => {
        const chat = { _id: chatId, messages: [], isChatLoading: true };
        return renderHook(
            () =>
                useStreamingMessages({
                    chat,
                    updateChatHook: { mutateAsync: jest.fn() },
                    onClientSideToolCall:
                        options.onClientSideToolCall || jest.fn(),
                    onStreamComplete: options.onStreamComplete || jest.fn(),
                    onStreamDetached: options.onStreamDetached || jest.fn(),
                }),
            { wrapper },
        );
    };

    const getAssistantPayload = (onStreamComplete) =>
        onStreamComplete.mock.calls
            .at(-1)?.[0]
            ?.assistantMessage?.payload?.map((item) => JSON.parse(item));

    // ---------------------------------------------------------------
    // 0. Optimistic send-time placeholder can start before the SSE reader exists
    // ---------------------------------------------------------------
    it("setIsStreaming starts a placeholder stream before the response reader attaches", async () => {
        const chatId = "chat_pending_stream";
        const { result } = renderStreamHook(chatId);

        act(() => {
            result.current.setIsStreaming(true);
        });

        await waitFor(() => {
            const streamState = queryClient.getQueryData(["stream", chatId]);
            expect(streamState).toMatchObject({
                chatId,
                isStreaming: true,
                isThinking: true,
            });
        });

        const streamState = queryClient.getQueryData(["stream", chatId]);
        expect(streamState.reader ?? null).toBeNull();
    });

    // ---------------------------------------------------------------
    // 1. Core behaviour: stream completion emits the final assistant payload
    // ---------------------------------------------------------------
    it("endStream emits AI response when stream completes", async () => {
        const chatId = "chat_write_test";
        const onStreamComplete = jest.fn();

        // Pre-populate the chat cache with a user message
        queryClient.setQueryData(["chat", chatId], {
            _id: chatId,
            messages: [{ _id: "m1", sender: "user", payload: "Hello" }],
            isChatLoading: true,
        });

        const { response, pushEvent } = createMockSSEStream();
        const { result } = renderStreamHook(chatId, { onStreamComplete });

        // Start the stream
        act(() => {
            result.current.setSubscriptionId(response);
        });

        // Push a data event and wait for processQueue to accumulate content
        pushEvent("data", { result: "Hello!" });
        await waitFor(() => {
            const s = queryClient.getQueryData(["stream", chatId]);
            expect(s?.streamingContent).toBe("Hello!");
        });

        // Complete the stream → triggers endStream
        pushEvent("complete", {});
        await waitFor(() => {
            const s = queryClient.getQueryData(["stream", chatId]);
            expect(!s?.isStreaming).toBe(true);
        });

        await waitFor(() => {
            expect(onStreamComplete).toHaveBeenCalled();
        });
        expect(onStreamComplete.mock.calls.at(-1)?.[0]).toMatchObject({
            chatId,
            payload: expect.any(Array),
            assistantMessage: expect.objectContaining({
                sender: "assistant",
            }),
        });
        expect(getAssistantPayload(onStreamComplete)).toEqual([
            {
                type: "text",
                text: "Hello!",
            },
            {
                type: "thinking",
                text: "",
                duration: 0,
            },
        ]);
    });

    it("endStream finishes when animation frames are paused", async () => {
        const chatId = "chat_hidden_tab";
        const onStreamComplete = jest.fn();

        queryClient.setQueryData(["chat", chatId], {
            _id: chatId,
            messages: [{ _id: "m1", sender: "user", payload: "Hello" }],
            isChatLoading: true,
        });

        global.requestAnimationFrame = jest.fn(() => 1);
        global.cancelAnimationFrame = jest.fn();

        const { response, pushEvent } = createMockSSEStream();
        const { result } = renderStreamHook(chatId, { onStreamComplete });

        act(() => {
            result.current.setSubscriptionId(response);
        });

        pushEvent("data", { result: "Background-safe" });
        pushEvent("complete", {});
        await waitFor(() => {
            expect(onStreamComplete).toHaveBeenCalledWith(
                expect.objectContaining({
                    chatId,
                    assistantMessage: expect.objectContaining({
                        sender: "assistant",
                    }),
                }),
            );
        });
        expect(getAssistantPayload(onStreamComplete)).toEqual([
            {
                type: "text",
                text: "Background-safe",
            },
            {
                type: "thinking",
                text: "",
                duration: 0,
            },
        ]);
    });

    // ---------------------------------------------------------------
    // 2. AI response is available even before any cache reconciliation
    // ---------------------------------------------------------------
    it("endStream preserves AI response even without refetch", async () => {
        const chatId = "chat_no_refetch";
        const onStreamComplete = jest.fn();

        queryClient.setQueryData(["chat", chatId], {
            _id: chatId,
            messages: [{ _id: "m1", sender: "user", payload: "Hi" }],
            isChatLoading: true,
        });

        const { response, pushEvent } = createMockSSEStream();
        const { result } = renderStreamHook(chatId, { onStreamComplete });

        act(() => {
            result.current.setSubscriptionId(response);
        });

        pushEvent("data", { result: "World" });
        await waitFor(() => {
            const s = queryClient.getQueryData(["stream", chatId]);
            expect(s?.streamingContent).toBe("World");
        });

        pushEvent("complete", {});
        await waitFor(() => {
            const s = queryClient.getQueryData(["stream", chatId]);
            expect(!s?.isStreaming).toBe(true);
        });

        await waitFor(() => {
            expect(onStreamComplete).toHaveBeenCalled();
        });
        expect(getAssistantPayload(onStreamComplete)).toEqual([
            {
                type: "text",
                text: "World",
            },
            {
                type: "thinking",
                text: "",
                duration: 0,
            },
        ]);
        expect(
            onStreamComplete.mock.calls.at(-1)?.[0]?.assistantMessage?.sender,
        ).toBe("assistant");
    });

    // ---------------------------------------------------------------
    // 3. No empty message appended when streaming content is empty
    // ---------------------------------------------------------------
    it("endStream skips write when no streaming content", async () => {
        const chatId = "chat_empty_content";
        const onStreamComplete = jest.fn();

        const originalMessages = [
            { _id: "m1", sender: "user", payload: "Test" },
        ];
        queryClient.setQueryData(["chat", chatId], {
            _id: chatId,
            messages: originalMessages,
            isChatLoading: true,
        });

        const { response, pushEvent } = createMockSSEStream();
        const { result } = renderStreamHook(chatId, { onStreamComplete });

        act(() => {
            result.current.setSubscriptionId(response);
        });

        // Complete without pushing any data events
        pushEvent("complete", {});
        await waitFor(() => {
            const s = queryClient.getQueryData(["stream", chatId]);
            // Stream finished — either removed entirely or re-created empty
            expect(!s?.isStreaming).toBe(true);
        });

        // Messages should be unchanged – no empty AI message added
        const chat = queryClient.getQueryData(["chat", chatId]);
        expect(chat.messages).toHaveLength(1);
        expect(chat.messages).toEqual(originalMessages);
        expect(onStreamComplete.mock.calls.at(-1)?.[0]?.assistantMessage).toBe(
            null,
        );
    });

    // ---------------------------------------------------------------
    // 4. New chat ID promotion: emits the resolved (real) chat ID
    // ---------------------------------------------------------------
    it("endStream uses resolvedChatId after new-chat promotion", async () => {
        const pendingId = "new";
        const realId = "real_456";
        const onStreamComplete = jest.fn();

        queryClient.setQueryData(["chat", pendingId], {
            _id: pendingId,
            messages: [{ _id: "m1", sender: "user", payload: "Temp msg" }],
            isChatLoading: true,
            isTemporary: true,
        });
        queryClient.setQueryData(["activeChats"], [{ _id: pendingId }]);
        queryClient.setQueryData(["userChatInfo"], {
            activeChatId: pendingId,
            recentChatIds: [pendingId],
        });

        const { response, pushEvent } = createMockSSEStream();
        const { result } = renderStreamHook(pendingId, {
            onStreamComplete,
        });

        act(() => {
            result.current.setSubscriptionId(response);
        });

        // Server sends real chatId and the hook promotes the pending chat.
        pushEvent("chatId", { chatId: realId });
        await flush();

        // Push content after promotion
        pushEvent("data", { result: "Promoted!" });
        await waitFor(() => {
            const s = queryClient.getQueryData(["stream", pendingId]);
            expect(s?.streamingContent).toBe("Promoted!");
        });
        await waitFor(() => {
            const s = queryClient.getQueryData(["stream", realId]);
            expect(s?.streamingContent).toBe("Promoted!");
        });

        pushEvent("complete", {});
        await waitFor(() => {
            const s = queryClient.getQueryData(["stream", pendingId]);
            expect(!s?.isStreaming).toBe(true);
        });

        await waitFor(() => {
            expect(onStreamComplete).toHaveBeenCalled();
        });
        const finalChat = queryClient.getQueryData(["chat", realId]);
        expect(finalChat).toBeDefined();
        expect(finalChat.messages).toHaveLength(1);
        expect(finalChat.messages[0]).toMatchObject({
            payload: "Temp msg",
            sender: "user",
        });
        expect(onStreamComplete.mock.calls.at(-1)?.[0]?.chatId).toBe(realId);
        expect(
            onStreamComplete.mock.calls.at(-1)?.[0]?.assistantMessage?.sender,
        ).toBe("assistant");
        expect(getAssistantPayload(onStreamComplete)).toEqual([
            {
                type: "text",
                text: "Promoted!",
            },
            {
                type: "thinking",
                text: "",
                duration: 0,
            },
        ]);

        expect(queryClient.getQueryData(["chat", pendingId])).toBeUndefined();
    });

    // ---------------------------------------------------------------
    // 5. Text/tool events remain interleaved in the emitted payload
    // ---------------------------------------------------------------
    it("endStream preserves interleaved stream chunks and tool events", async () => {
        const chatId = "chat_interleaved";
        const onStreamComplete = jest.fn();

        queryClient.setQueryData(["chat", chatId], {
            _id: chatId,
            messages: [{ _id: "m1", sender: "user", payload: "Go" }],
            isChatLoading: true,
        });

        const { response, pushEvent } = createMockSSEStream();
        const { result } = renderStreamHook(chatId, { onStreamComplete });

        act(() => {
            result.current.setSubscriptionId(response);
        });

        pushEvent("data", { result: "Stream chunk 1" });
        pushEvent("info", {
            info: JSON.stringify({
                toolMessage: {
                    type: "start",
                    callId: "tool-1",
                    icon: "🛠️",
                    userMessage: "Tool call 1",
                },
            }),
        });
        pushEvent("data", { result: "Stream chunk 2" });
        pushEvent("info", {
            info: JSON.stringify({
                toolMessage: {
                    type: "start",
                    callId: "tool-2",
                    icon: "🛠️",
                    userMessage: "Tool call 2",
                },
            }),
        });
        pushEvent("info", {
            info: JSON.stringify({
                toolMessage: {
                    type: "start",
                    callId: "tool-3",
                    icon: "🛠️",
                    userMessage: "Tool call 3",
                },
            }),
        });
        pushEvent("data", { result: "Stream chunk 3" });
        pushEvent("complete", {});

        await waitFor(() => {
            const s = queryClient.getQueryData(["stream", chatId]);
            expect(!s?.isStreaming).toBe(true);
        });

        const payload = getAssistantPayload(onStreamComplete);
        expect(payload).toEqual([
            { type: "text", text: "Stream chunk 1" },
            {
                type: "tool_event",
                callId: "tool-1",
                icon: "🛠️",
                userMessage: "Tool call 1",
                status: "thinking",
                error: null,
                presentation: "default",
            },
            { type: "text", text: "Stream chunk 2" },
            {
                type: "tool_event",
                callId: "tool-2",
                icon: "🛠️",
                userMessage: "Tool call 2",
                status: "thinking",
                error: null,
                presentation: "default",
            },
            {
                type: "tool_event",
                callId: "tool-3",
                icon: "🛠️",
                userMessage: "Tool call 3",
                status: "thinking",
                error: null,
                presentation: "default",
            },
            { type: "text", text: "Stream chunk 3" },
            { type: "thinking", text: "", duration: 0 },
        ]);
    });

    it("preserves inline user presentation from streamed tool messages", async () => {
        const chatId = "chat_inline_user";
        const onStreamComplete = jest.fn();

        queryClient.setQueryData(["chat", chatId], {
            _id: chatId,
            messages: [{ _id: "m1", sender: "user", payload: "Focus on AI" }],
            isChatLoading: true,
        });

        const { response, pushEvent } = createMockSSEStream();
        const { result } = renderStreamHook(chatId, { onStreamComplete });

        act(() => {
            result.current.setSubscriptionId(response);
        });

        pushEvent("info", {
            info: JSON.stringify({
                toolMessage: {
                    type: "start",
                    callId: "inject-1",
                    icon: "💬",
                    userMessage: "Focus on AI please",
                    presentation: "inline_user",
                },
            }),
        });
        pushEvent("data", { result: "Acknowledged." });
        pushEvent("complete", {});

        await waitFor(() => {
            const s = queryClient.getQueryData(["stream", chatId]);
            expect(!s?.isStreaming).toBe(true);
        });

        const payload = getAssistantPayload(onStreamComplete);
        expect(payload[0]).toEqual({
            type: "tool_event",
            callId: "inject-1",
            icon: "💬",
            userMessage: "Focus on AI please",
            status: "thinking",
            error: null,
            presentation: "inline_user",
        });
        expect(payload[1]).toEqual({
            type: "text",
            text: "Acknowledged.",
        });
        expect(payload[2]).toEqual({
            type: "thinking",
            text: "",
            duration: 0,
        });
    });

    it("uses echoed toolMessage events as the source of truth for client-side tool rows", async () => {
        const chatId = "chat_client_tool_echo";
        const onStreamComplete = jest.fn();
        const onClientSideToolCall = jest.fn(() => Promise.resolve());

        queryClient.setQueryData(["chat", chatId], {
            _id: chatId,
            messages: [{ _id: "m1", sender: "user", payload: "Navigate" }],
            isChatLoading: true,
        });

        const { response, pushEvent } = createMockSSEStream();
        const { result } = renderStreamHook(chatId, {
            onStreamComplete,
            onClientSideToolCall,
        });

        act(() => {
            result.current.setSubscriptionId(response);
        });

        pushEvent("info", {
            info: JSON.stringify({
                clientSideTool: true,
                toolCallbackId: "cb-1",
                toolCallbackName: "Navigate",
                toolCallbackMessage: "Opening chat",
            }),
        });

        await waitFor(() => {
            expect(onClientSideToolCall).toHaveBeenCalledWith(
                expect.objectContaining({
                    toolCallbackId: "cb-1",
                    toolCallbackName: "Navigate",
                }),
            );
        });

        const preEchoState = queryClient.getQueryData(["stream", chatId]);
        expect(preEchoState?.inlinePayloadItems || []).toEqual([]);

        pushEvent("info", {
            info: JSON.stringify({
                toolMessage: {
                    type: "start",
                    callId: "srv-1",
                    icon: "🧭",
                    userMessage: "Opening chat",
                },
            }),
        });

        await waitFor(() => {
            const state = queryClient.getQueryData(["stream", chatId]);
            expect(state?.inlinePayloadItems).toHaveLength(1);
        });
        expect(
            JSON.parse(
                queryClient.getQueryData(["stream", chatId])
                    .inlinePayloadItems[0],
            ),
        ).toEqual({
            type: "tool_event",
            callId: "srv-1",
            icon: "🧭",
            userMessage: "Opening chat",
            status: "thinking",
            error: null,
            presentation: "default",
        });

        pushEvent("complete", {});

        await waitFor(() => {
            expect(onStreamComplete).toHaveBeenCalled();
        });

        expect(getAssistantPayload(onStreamComplete)).toEqual([
            {
                type: "tool_event",
                callId: "srv-1",
                icon: "🧭",
                userMessage: "Opening chat",
                status: "thinking",
                error: null,
                presentation: "default",
            },
            {
                type: "thinking",
                text: "",
                duration: 0,
            },
        ]);
    });

    it("waits for echoed finish toolMessage before completing a client-side tool row", async () => {
        const chatId = "chat_client_tool_finish";
        const onStreamComplete = jest.fn();
        const onClientSideToolCall = jest.fn(() => Promise.resolve());

        queryClient.setQueryData(["chat", chatId], {
            _id: chatId,
            messages: [{ _id: "m1", sender: "user", payload: "Navigate" }],
            isChatLoading: true,
        });

        const { response, pushEvent } = createMockSSEStream();
        const { result } = renderStreamHook(chatId, {
            onStreamComplete,
            onClientSideToolCall,
        });

        act(() => {
            result.current.setSubscriptionId(response);
        });

        pushEvent("info", {
            info: JSON.stringify({
                clientSideTool: true,
                toolCallbackId: "cb-2",
                toolCallbackName: "Navigate",
                toolMessage: {
                    type: "start",
                    callId: "srv-2",
                    icon: "🧭",
                    userMessage: "Opening chat",
                },
            }),
        });

        await waitFor(() => {
            const state = queryClient.getQueryData(["stream", chatId]);
            expect(JSON.parse(state.inlinePayloadItems[0])).toMatchObject({
                callId: "srv-2",
                status: "thinking",
            });
        });

        await flush();

        const midStreamState = queryClient.getQueryData(["stream", chatId]);
        expect(JSON.parse(midStreamState.inlinePayloadItems[0])).toMatchObject({
            callId: "srv-2",
            status: "thinking",
        });

        pushEvent("info", {
            info: JSON.stringify({
                toolMessage: {
                    type: "finish",
                    callId: "srv-2",
                    icon: "🧭",
                    userMessage: "Opening chat",
                    success: true,
                },
            }),
        });

        await waitFor(() => {
            const state = queryClient.getQueryData(["stream", chatId]);
            expect(JSON.parse(state.inlinePayloadItems[0])).toMatchObject({
                type: "tool_event",
                callId: "srv-2",
                icon: "🧭",
                userMessage: "Opening chat",
                status: "completed",
                presentation: "default",
            });
        });

        pushEvent("complete", {});

        await waitFor(() => {
            expect(onStreamComplete).toHaveBeenCalled();
        });

        expect(getAssistantPayload(onStreamComplete)).toEqual([
            expect.objectContaining({
                type: "tool_event",
                callId: "srv-2",
                icon: "🧭",
                userMessage: "Opening chat",
                status: "completed",
                presentation: "default",
            }),
            {
                type: "thinking",
                text: "",
                duration: 0,
            },
        ]);
    });

    // ---------------------------------------------------------------
    // 6. Ephemeral content is preserved in the emitted assistant message
    // ---------------------------------------------------------------
    it("endStream writes ephemeral content", async () => {
        const chatId = "chat_ephemeral";
        const onStreamComplete = jest.fn();

        queryClient.setQueryData(["chat", chatId], {
            _id: chatId,
            messages: [{ _id: "m1", sender: "user", payload: "Think" }],
            isChatLoading: true,
        });

        const { response, pushEvent } = createMockSSEStream();
        const { result } = renderStreamHook(chatId, { onStreamComplete });

        act(() => {
            result.current.setSubscriptionId(response);
        });

        // Push a regular data event so streamingContent is non-empty
        pushEvent("data", { result: "result" });
        await waitFor(() => {
            const s = queryClient.getQueryData(["stream", chatId]);
            expect(s?.streamingContent).toBe("result");
        });

        pushEvent("info", {
            info: JSON.stringify({ ephemeral: true }),
        });
        pushEvent("data", { result: "thinking..." });

        pushEvent("complete", {});
        await waitFor(() => {
            const s = queryClient.getQueryData(["stream", chatId]);
            expect(!s?.isStreaming).toBe(true);
        });

        await waitFor(() => {
            expect(onStreamComplete).toHaveBeenCalled();
        });
        const payload = getAssistantPayload(onStreamComplete);
        expect(
            onStreamComplete.mock.calls.at(-1)?.[0]?.assistantMessage?.sender,
        ).toBe("assistant");
        expect(Array.isArray(payload)).toBe(true);
        expect(payload[0]).toMatchObject({
            type: "text",
            text: "result",
        });
        expect(payload[1]).toMatchObject({
            type: "thinking",
            text: "thinking...",
        });
    });

    // ---------------------------------------------------------------
    // 7. STREAM_KEY is cleared after endStream
    // ---------------------------------------------------------------
    it("endStream clears STREAM_KEY", async () => {
        const chatId = "chat_clear_stream";

        queryClient.setQueryData(["chat", chatId], {
            _id: chatId,
            messages: [],
            isChatLoading: true,
        });

        const { response, pushEvent } = createMockSSEStream();
        const { result } = renderStreamHook(chatId);

        act(() => {
            result.current.setSubscriptionId(response);
        });

        // Verify stream key exists while streaming
        await waitFor(() => {
            const s = queryClient.getQueryData(["stream", chatId]);
            expect(s?.isStreaming).toBe(true);
        });

        pushEvent("data", { result: "x" });
        await waitFor(() => {
            const s = queryClient.getQueryData(["stream", chatId]);
            expect(s?.streamingContent).toBe("x");
        });

        pushEvent("complete", {});
        await waitFor(() => {
            const s = queryClient.getQueryData(["stream", chatId]);
            expect(!s?.isStreaming).toBe(true);
        });
    });

    it("falls back to detached waiting mode without a toast on stream transport loss", async () => {
        const chatId = "chat_detached_stream";
        const onStreamComplete = jest.fn();
        const onStreamDetached = jest.fn();
        const { toast } = require("react-toastify");

        queryClient.setQueryData(["chat", chatId], {
            _id: chatId,
            messages: [{ _id: "m1", sender: "user", payload: "Hello" }],
            isChatLoading: true,
        });
        queryClient.setQueryData(["chatSending", chatId], Date.now());

        const { response, pushEvent, error } = createMockSSEStream();
        const { result } = renderStreamHook(chatId, {
            onStreamComplete,
            onStreamDetached,
        });

        act(() => {
            result.current.setSubscriptionId(response);
        });

        pushEvent("data", { result: "partial" });
        await waitFor(() => {
            const s = queryClient.getQueryData(["stream", chatId]);
            expect(s?.streamingContent).toBe("partial");
        });

        error(new Error("socket closed"));

        await waitFor(() => {
            expect(onStreamDetached).toHaveBeenCalledWith({
                chatId,
            });
        });

        expect(onStreamComplete).not.toHaveBeenCalled();
        expect(toast.error).not.toHaveBeenCalled();
        expect(queryClient.getQueryData(["stream", chatId])).toBeUndefined();
        expect(queryClient.getQueryData(["chatSending", chatId])).toBeNull();
    });
});
