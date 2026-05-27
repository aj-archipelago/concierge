/**
 * @jest-environment jsdom
 */

import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axios from "../utils/axios-client";
import {
    mergeFetchedChatResponse,
    syncInFlightChatCache,
    useDeleteChat,
    useGetActiveChats,
    useGetChatById,
    useSetActiveChatId,
    useUpdateChat,
} from "./chats";

jest.mock("../utils/axios-client", () => ({
    __esModule: true,
    default: {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
    },
}));

describe("useUpdateChat", () => {
    let queryClient;

    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                },
                mutations: {
                    retry: false,
                },
            },
        });
        jest.clearAllMocks();
    });

    it("preserves newer cached messages for non-message updates", async () => {
        const chatId = "507f1f77bcf86cd799439011";
        const cachedMessages = [
            { _id: "m_latest", sender: "assistant", payload: "latest assistant" },
        ];

        queryClient.setQueryData(["chat", chatId], {
            _id: chatId,
            title: "Before",
            messages: cachedMessages,
            isChatLoading: true,
        });

        axios.put.mockResolvedValue({
            data: {
                _id: chatId,
                title: "After",
                // Simulate stale server payload from an in-flight side mutation.
                messages: [
                    {
                        _id: "m_stale",
                        sender: "assistant",
                        payload: "stale assistant",
                    },
                ],
                isChatLoading: false,
            },
        });

        const { result } = renderHook(() => useUpdateChat(), { wrapper });

        await act(async () => {
            await result.current.mutateAsync({
                chatId,
                title: "After",
                isChatLoading: false,
            });
        });

        const finalChat = queryClient.getQueryData(["chat", chatId]);
        expect(finalChat.title).toBe("After");
        expect(finalChat.messages).toHaveLength(1);
        expect(finalChat.messages[0]).toMatchObject(cachedMessages[0]);
        expect(finalChat.messages[0]._clientId).toEqual(expect.any(String));
    });

    it("optimistically shows truncated messages on replay", async () => {
        const chatId = "507f1f77bcf86cd799439013";
        const originalMessages = [
            { _id: "m1", sender: "user", payload: "first" },
            { _id: "m2", sender: "assistant", payload: "response 1" },
            { _id: "m3", sender: "user", payload: "second" },
            { _id: "m4", sender: "assistant", payload: "response 2" },
        ];

        queryClient.setQueryData(["chat", chatId], {
            _id: chatId,
            title: "Chat",
            messages: originalMessages,
        });

        // Replay from the first user message — truncate to before it,
        // then add the replayed message. The new array is shorter.
        const replayMessages = [
            { _id: "m1", sender: "user", payload: "first" },
        ];

        axios.put.mockResolvedValue({
            data: {
                _id: chatId,
                title: "Chat",
                messages: replayMessages,
                isChatLoading: true,
            },
        });

        const { result } = renderHook(() => useUpdateChat(), { wrapper });

        await act(async () => {
            await result.current.mutateAsync({
                chatId,
                messages: replayMessages,
                isChatLoading: true,
            });
        });

        // The optimistic update should show the truncated messages immediately
        // (not keep the old 4-message array until the server responds)
        const finalChat = queryClient.getQueryData(["chat", chatId]);
        expect(finalChat.messages).toHaveLength(1);
        expect(finalChat.messages[0].payload).toBe("first");
    });

    it("optimistically clears chat storage warning metadata when clearing messages", async () => {
        const chatId = "507f1f77bcf86cd799439015";

        queryClient.setQueryData(["chat", chatId], {
            _id: chatId,
            title: "Large chat",
            messages: [{ _id: "m1", sender: "user", payload: "hello" }],
            messageStorageBytes: 1_800_000,
            messagesCompacted: true,
            messagesCompactedAt: "2026-04-28T00:00:00.000Z",
        });

        let resolveRequest;
        axios.put.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveRequest = () =>
                        resolve({
                            data: {
                                _id: chatId,
                                title: "",
                                messages: [],
                                messageStorageBytes: 0,
                                messagesCompacted: false,
                                messagesCompactedAt: null,
                            },
                        });
                }),
        );

        const { result } = renderHook(() => useUpdateChat(), { wrapper });

        const pending = result.current.mutateAsync({
            chatId,
            messages: [],
            title: "",
        });

        await waitFor(() => expect(axios.put).toHaveBeenCalled());
        const optimisticChat = queryClient.getQueryData(["chat", chatId]);
        expect(optimisticChat.messages).toEqual([]);
        expect(optimisticChat.messageStorageBytes).toBe(0);
        expect(optimisticChat.messagesCompacted).toBe(false);
        expect(optimisticChat.messagesCompactedAt).toBeNull();

        resolveRequest();
        await pending;
    });

    it("accepts server messages when the mutation explicitly updates messages", async () => {
        const chatId = "507f1f77bcf86cd799439012";

        queryClient.setQueryData(["chat", chatId], {
            _id: chatId,
            title: "Chat",
            messages: [{ _id: "m1", sender: "user", payload: "hello" }],
        });

        const serverMessages = [
            { _id: "m1", sender: "user", payload: "hello" },
            { _id: "m2", sender: "assistant", payload: "hi there" },
        ];

        axios.put.mockResolvedValue({
            data: {
                _id: chatId,
                title: "Chat",
                messages: serverMessages,
            },
        });

        const { result } = renderHook(() => useUpdateChat(), { wrapper });

        await act(async () => {
            await result.current.mutateAsync({
                chatId,
                messages: [
                    { _id: "m1", sender: "user", payload: "hello" },
                    { _id: "m1_local", sender: "user", payload: "local echo" },
                ],
                isChatLoading: true,
            });
        });

        const finalChat = queryClient.getQueryData(["chat", chatId]);
        expect(finalChat.messages).toHaveLength(serverMessages.length);
        expect(finalChat.messages).toEqual(
            serverMessages.map((message) =>
                expect.objectContaining({
                    ...message,
                    _clientId: expect.any(String),
                }),
            ),
        );
    });

    it("optimistically applies equal-length message edits", async () => {
        const chatId = "507f1f77bcf86cd799439014";
        const originalMessages = [
            { _id: "m1", sender: "user", payload: "before" },
            { _id: "m2", sender: "assistant", payload: "before reply" },
        ];
        const updatedMessages = [
            { _id: "m1", sender: "user", payload: "after" },
            { _id: "m2", sender: "assistant", payload: "before reply" },
        ];

        queryClient.setQueryData(["chat", chatId], {
            _id: chatId,
            title: "Chat",
            messages: originalMessages,
        });

        let resolveRequest;
        axios.put.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveRequest = () =>
                        resolve({
                            data: {
                                _id: chatId,
                                title: "Chat",
                                messages: updatedMessages,
                            },
                        });
                }),
        );

        const { result } = renderHook(() => useUpdateChat(), { wrapper });

        const pending = result.current.mutateAsync({
            chatId,
            messages: updatedMessages,
        });

        await waitFor(() => expect(axios.put).toHaveBeenCalled());
        const optimisticChat = queryClient.getQueryData(["chat", chatId]);
        expect(optimisticChat.messages[0]).toMatchObject(updatedMessages[0]);

        resolveRequest();
        await pending;
    });
});

describe("mergeFetchedChatResponse", () => {
    let queryClient;

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                },
                mutations: {
                    retry: false,
                },
            },
        });
        jest.clearAllMocks();
    });

    it("preserves optimistic first-message state while a send is in flight", () => {
        const chatId = "507f1f77bcf86cd799439099";
        const cachedChat = {
            _id: chatId,
            messages: [{ sender: "user", payload: "hello" }],
            isChatLoading: true,
            isUnused: false,
        };
        const serverChat = {
            _id: chatId,
            messages: [],
            isChatLoading: false,
            isUnused: true,
        };

        queryClient.setQueryData(["chatSending", chatId], Date.now());

        const merged = mergeFetchedChatResponse(
            queryClient,
            chatId,
            cachedChat,
            serverChat,
        );

        expect(merged.messages).toEqual(cachedChat.messages);
        expect(merged.isChatLoading).toBe(true);
        expect(merged.isUnused).toBe(false);
    });

    it("preserves already-visible history when a truncated fetch returns a newer tail", () => {
        const chatId = "507f1f77bcf86cd799439098";
        const cachedChat = {
            _id: chatId,
            messages: [
                {
                    _id: "m1",
                    sender: "user",
                    payload: "older 1",
                    sentTime: "2026-03-13T10:00:00.000Z",
                },
                {
                    _id: "m2",
                    sender: "assistant",
                    payload: "older 2",
                    sentTime: "2026-03-13T10:00:01.000Z",
                },
                {
                    _id: "m3",
                    sender: "user",
                    payload: "latest user",
                    sentTime: "2026-03-13T10:00:02.000Z",
                },
            ],
            messagesTruncated: true,
            hasMoreMessages: true,
        };
        const serverChat = {
            _id: chatId,
            messages: [
                {
                    _id: "m2",
                    sender: "assistant",
                    payload: "older 2",
                    sentTime: "2026-03-13T10:00:01.000Z",
                },
                {
                    _id: "m4",
                    sender: "assistant",
                    payload: "new reply",
                    sentTime: "2026-03-13T10:00:03.000Z",
                },
            ],
            messagesTruncated: true,
            hasMoreMessages: true,
        };

        const merged = mergeFetchedChatResponse(
            queryClient,
            chatId,
            cachedChat,
            serverChat,
        );

        expect(merged.messages.map((message) => message._id)).toEqual([
            "m1",
            "m2",
            "m3",
            "m4",
        ]);
    });

    it("does not duplicate settled history when cached messages also have _clientId values", () => {
        const chatId = "507f1f77bcf86cd799439097";
        const cachedChat = {
            _id: chatId,
            messages: [
                {
                    _id: "m1",
                    _clientId: "client-message:chat:m1",
                    sender: "user",
                    payload: "older 1",
                    sentTime: "2026-03-13T10:00:00.000Z",
                },
                {
                    _id: "m2",
                    _clientId: "client-message:chat:m2",
                    sender: "assistant",
                    payload: "older 2",
                    sentTime: "2026-03-13T10:00:01.000Z",
                },
            ],
            messagesTruncated: true,
            hasMoreMessages: true,
        };
        const serverChat = {
            _id: chatId,
            messages: [
                {
                    _id: "m1",
                    sender: "user",
                    payload: "older 1",
                    sentTime: "2026-03-13T10:00:00.000Z",
                },
                {
                    _id: "m2",
                    sender: "assistant",
                    payload: "older 2",
                    sentTime: "2026-03-13T10:00:01.000Z",
                },
                {
                    _id: "m3",
                    sender: "assistant",
                    payload: "new reply",
                    sentTime: "2026-03-13T10:00:02.000Z",
                },
            ],
            messagesTruncated: true,
            hasMoreMessages: true,
        };

        const merged = mergeFetchedChatResponse(
            queryClient,
            chatId,
            cachedChat,
            serverChat,
        );

        expect(merged.messages.map((message) => message._id)).toEqual([
            "m1",
            "m2",
            "m3",
        ]);
    });

    it("keeps a local stream-complete assistant while the server catch-up fetch is stale", () => {
        const chatId = "507f1f77bcf86cd799439096";
        const cachedAssistant = {
            _id: null,
            _clientId: "stream-end:507f1f77bcf86cd799439096:1",
            sender: "assistant",
            direction: "incoming",
            position: "single",
            payload: "local reply",
            sentTime: "2026-04-26T10:00:01.000Z",
            isServerGenerated: true,
        };
        const cachedChat = {
            _id: chatId,
            messages: [
                {
                    _id: "m1",
                    sender: "user",
                    direction: "outgoing",
                    position: "single",
                    payload: "hello",
                    sentTime: "2026-04-26T10:00:00.000Z",
                },
                cachedAssistant,
            ],
            isChatLoading: false,
        };
        const staleServerChat = {
            _id: chatId,
            messages: [cachedChat.messages[0]],
            isChatLoading: false,
        };

        const merged = mergeFetchedChatResponse(
            queryClient,
            chatId,
            cachedChat,
            staleServerChat,
        );

        expect(merged.messages).toEqual(cachedChat.messages);
    });

    it("replaces a local stream-complete assistant when the persisted row arrives", () => {
        const chatId = "507f1f77bcf86cd799439094";
        const localPayload = [
            JSON.stringify({ type: "text", text: "local reply" }),
            JSON.stringify({ type: "thinking", text: "", duration: 2 }),
        ];
        const serverPayload = [
            JSON.stringify({ type: "text", text: "local reply" }),
            JSON.stringify({ type: "thinking", text: "", duration: 4 }),
        ];
        const cachedChat = {
            _id: chatId,
            messages: [
                {
                    _id: "m1",
                    sender: "user",
                    direction: "outgoing",
                    position: "single",
                    payload: "hello",
                },
                {
                    _id: null,
                    _clientId: "stream-end:507f1f77bcf86cd799439094:1",
                    sender: "assistant",
                    direction: "incoming",
                    position: "single",
                    payload: localPayload,
                    tool: null,
                    isServerGenerated: true,
                },
            ],
        };
        const serverChat = {
            _id: chatId,
            messages: [
                cachedChat.messages[0],
                {
                    _id: "m2",
                    sender: "assistant",
                    direction: "incoming",
                    position: "single",
                    payload: serverPayload,
                    tool: JSON.stringify({ citations: [] }),
                    isServerGenerated: true,
                },
            ],
        };

        const merged = mergeFetchedChatResponse(
            queryClient,
            chatId,
            cachedChat,
            serverChat,
        );

        expect(merged.messages).toHaveLength(2);
        expect(merged.messages[1]).toMatchObject({ _id: "m2" });
    });

    it("replaces a full optimistic user/assistant pair with the persisted pair", () => {
        const chatId = "507f1f77bcf86cd799439092";
        const userPayload = [JSON.stringify({ type: "text", text: "hello" })];
        const localAssistantPayload = [
            JSON.stringify({ type: "text", text: "reply" }),
            JSON.stringify({ type: "thinking", text: "", duration: 1 }),
        ];
        const serverAssistantPayload = [
            JSON.stringify({ type: "text", text: "reply" }),
            JSON.stringify({ type: "thinking", text: "", duration: 3 }),
        ];
        const cachedChat = {
            _id: chatId,
            messages: [
                {
                    _id: null,
                    _clientId: "draft-user:507f1f77bcf86cd799439092:1",
                    sender: "user",
                    direction: "outgoing",
                    position: "single",
                    payload: userPayload,
                    sentTime: "2026-04-26T10:00:00.000Z",
                },
                {
                    _id: null,
                    _clientId: "stream-end:507f1f77bcf86cd799439092:2",
                    sender: "assistant",
                    direction: "incoming",
                    position: "single",
                    payload: localAssistantPayload,
                    tool: null,
                    sentTime: "2026-04-26T10:00:01.000Z",
                    isServerGenerated: true,
                },
            ],
            isChatLoading: false,
        };
        const serverChat = {
            _id: chatId,
            messages: [
                {
                    _id: "m1",
                    sender: "user",
                    direction: "outgoing",
                    position: "single",
                    payload: userPayload,
                    sentTime: "2026-04-26T10:00:02.000Z",
                },
                {
                    _id: "m2",
                    sender: "assistant",
                    direction: "incoming",
                    position: "single",
                    payload: serverAssistantPayload,
                    tool: JSON.stringify({ citations: [] }),
                    sentTime: "2026-04-26T10:00:03.000Z",
                    isServerGenerated: true,
                },
            ],
            isChatLoading: false,
        };

        const merged = mergeFetchedChatResponse(
            queryClient,
            chatId,
            cachedChat,
            serverChat,
        );

        expect(merged.messages).toHaveLength(2);
        expect(merged.messages.map((message) => message._id)).toEqual([
            "m1",
            "m2",
        ]);
    });
});

describe("syncInFlightChatCache", () => {
    let queryClient;

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                },
                mutations: {
                    retry: false,
                },
            },
        });
    });

    it("preserves cached messages while marking a chat as in flight", () => {
        const chatId = "507f1f77bcf86cd799439095";
        const cachedChat = {
            _id: chatId,
            title: "Chat",
            messages: [{ _id: "m1", sender: "user", payload: "hello" }],
            isChatLoading: false,
            activeSubscriptionId: null,
            isUnused: true,
        };

        queryClient.setQueryData(["chat", chatId], cachedChat);
        queryClient.setQueryData(["activeChats"], [cachedChat]);

        const nextChat = syncInFlightChatCache(queryClient, chatId, {
            activeSubscriptionId: "sub_123",
        });

        expect(nextChat).toMatchObject({
            _id: chatId,
            isChatLoading: true,
            activeSubscriptionId: "sub_123",
            isUnused: false,
        });
        expect(nextChat.messages).toHaveLength(1);
        expect(nextChat.messages[0]).toMatchObject(cachedChat.messages[0]);
        expect(nextChat.messages[0]._clientId).toEqual(expect.any(String));
        expect(queryClient.getQueryData(["activeChats"])[0]).toMatchObject({
            _id: chatId,
            isChatLoading: true,
            activeSubscriptionId: "sub_123",
            isUnused: false,
        });
    });

    it("keeps a local assistant while a later user message is persisted", () => {
        const chatId = "507f1f77bcf86cd799439093";
        const cachedChat = {
            _id: chatId,
            title: "Chat",
            messages: [
                {
                    _id: "m1",
                    sender: "user",
                    direction: "outgoing",
                    position: "single",
                    payload: "first user",
                },
                {
                    _id: null,
                    _clientId: "stream-end:507f1f77bcf86cd799439093:1",
                    sender: "assistant",
                    direction: "incoming",
                    position: "single",
                    payload: "assistant reply",
                    isServerGenerated: true,
                },
                {
                    _id: null,
                    _clientId: "draft-user:507f1f77bcf86cd799439093:2",
                    sender: "user",
                    direction: "outgoing",
                    position: "single",
                    payload: "second user",
                },
            ],
            isChatLoading: true,
            isUnused: false,
        };

        queryClient.setQueryData(["chat", chatId], cachedChat);
        queryClient.setQueryData(["chatSending", chatId], Date.now());

        const nextChat = syncInFlightChatCache(queryClient, chatId, {
            serverChat: {
                _id: chatId,
                messages: [
                    cachedChat.messages[0],
                    {
                        _id: "m3",
                        sender: "user",
                        direction: "outgoing",
                        position: "single",
                        payload: "second user",
                    },
                ],
            },
        });

        expect(nextChat.messages.map((message) => message.payload)).toEqual([
            "first user",
            "assistant reply",
            "second user",
        ]);
        expect(nextChat.messages[2]).toMatchObject({ _id: "m3" });
    });
});

describe("query polling callbacks", () => {
    let queryClient;

    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                },
                mutations: {
                    retry: false,
                },
            },
        });
        jest.clearAllMocks();
        axios.get.mockResolvedValue({ data: [] });
    });

    it("polls active chats when the query state contains chats", () => {
        renderHook(() => useGetActiveChats(), { wrapper });

        const query = queryClient
            .getQueryCache()
            .find({ queryKey: ["activeChats"] });

        expect(
            query.options.refetchInterval({
                state: { data: [{ _id: "507f1f77bcf86cd799439021" }] },
            }),
        ).toBe(20000);
        expect(
            query.options.refetchInterval({
                state: { data: [] },
            }),
        ).toBe(false);
    });

    it("polls a loading chat when the query state shows isChatLoading", () => {
        const chatId = "507f1f77bcf86cd799439022";
        queryClient.setQueryData(["chat", chatId], {
            _id: chatId,
            isChatLoading: true,
            messages: [],
        });

        renderHook(() => useGetChatById(chatId), { wrapper });

        const query = queryClient
            .getQueryCache()
            .find({ queryKey: ["chat", chatId] });

        expect(
            query.options.refetchInterval({
                state: {
                    data: {
                        _id: chatId,
                        isChatLoading: true,
                    },
                },
            }),
        ).toBe(1000);
        expect(
            query.options.refetchInterval({
                state: {
                    data: {
                        _id: chatId,
                        isChatLoading: false,
                    },
                },
            }),
        ).toBe(false);
    });
});

describe("useDeleteChat", () => {
    let queryClient;

    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                },
                mutations: {
                    retry: false,
                },
            },
        });
        jest.clearAllMocks();
        axios.delete.mockResolvedValue({ data: {} });
    });

    it("removes chats even when cached ids are object-like values", async () => {
        const chatId = "507f1f77bcf86cd799439023";
        const objectLikeId = {
            toString: () => chatId,
        };

        queryClient.setQueryData(
            ["activeChats"],
            [
                { _id: objectLikeId, title: "Delete me" },
                { _id: "507f1f77bcf86cd799439024", title: "Keep me" },
            ],
        );
        queryClient.setQueryData(["userChatInfo"], {
            activeChatId: chatId,
            recentChatIds: [objectLikeId, "507f1f77bcf86cd799439024"],
        });
        queryClient.setQueryData(["chat", chatId], {
            _id: chatId,
            title: "Delete me",
        });
        queryClient.setQueryData(["chats"], {
            pages: [
                [
                    { _id: objectLikeId, title: "Delete me" },
                    { _id: "507f1f77bcf86cd799439024", title: "Keep me" },
                ],
            ],
            pageParams: [1],
        });

        const { result } = renderHook(() => useDeleteChat(), { wrapper });

        await act(async () => {
            await result.current.mutateAsync({ chatId });
        });

        expect(
            queryClient
                .getQueryData(["activeChats"])
                .map((chat) => String(chat?._id)),
        ).toEqual(["507f1f77bcf86cd799439024"]);
        expect(queryClient.getQueryData(["userChatInfo"])).toMatchObject({
            activeChatId: "507f1f77bcf86cd799439024",
            recentChatIds: ["507f1f77bcf86cd799439024"],
        });
        expect(
            queryClient
                .getQueryData(["chats"])
                .pages[0].map((chat) => String(chat?._id)),
        ).toEqual(["507f1f77bcf86cd799439024"]);
        expect(queryClient.getQueryData(["chat", chatId])).toBeUndefined();
    });
});

describe("useSetActiveChatId", () => {
    let queryClient;

    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                },
                mutations: {
                    retry: false,
                },
            },
        });
        jest.clearAllMocks();
    });

    it("moves an activated chat to the front of the MRU list", async () => {
        const ids = [
            "507f1f77bcf86cd799439031",
            "507f1f77bcf86cd799439032",
            "507f1f77bcf86cd799439033",
            "507f1f77bcf86cd799439034",
        ];

        queryClient.setQueryData(["userChatInfo"], {
            activeChatId: ids[0],
            recentChatIds: ids,
        });
        queryClient.setQueryData(
            ["activeChats"],
            ids.slice(0, 3).map((_id, index) => ({
                _id,
                title: `Chat ${index + 1}`,
            })),
        );

        axios.put.mockResolvedValue({
            data: {
                activeChatId: ids[2],
                recentChatIds: [ids[2], ids[0], ids[1], ids[3]],
            },
        });

        const { result } = renderHook(() => useSetActiveChatId(), { wrapper });
        let pendingMutation;

        act(() => {
            pendingMutation = result.current.mutateAsync(ids[2]);
        });

        await waitFor(() =>
            expect(
                queryClient.getQueryData(["userChatInfo"]).activeChatId,
            ).toBe(ids[2]),
        );
        // Optimistic update moves ids[2] to front
        expect(
            queryClient
                .getQueryData(["activeChats"])
                .map((chat) => String(chat?._id)),
        ).toEqual([ids[2], ids[0], ids[1]]);

        await act(async () => {
            await pendingMutation;
        });

        expect(queryClient.getQueryData(["userChatInfo"]).activeChatId).toBe(
            ids[2],
        );
    });

    it("moves chats outside the top three to the front", async () => {
        const ids = [
            "507f1f77bcf86cd799439041",
            "507f1f77bcf86cd799439042",
            "507f1f77bcf86cd799439043",
            "507f1f77bcf86cd799439044",
        ];

        queryClient.setQueryData(["userChatInfo"], {
            activeChatId: ids[0],
            recentChatIds: ids,
        });
        queryClient.setQueryData(
            ["activeChats"],
            ids.slice(0, 3).map((_id, index) => ({
                _id,
                title: `Chat ${index + 1}`,
            })),
        );
        queryClient.setQueryData(["chat", ids[3]], {
            _id: ids[3],
            title: "Chat 4",
        });

        axios.put.mockResolvedValue({
            data: {
                activeChatId: ids[3],
                recentChatIds: [ids[3], ...ids.slice(0, 3)],
            },
        });

        const { result } = renderHook(() => useSetActiveChatId(), { wrapper });

        await act(async () => {
            await result.current.mutateAsync(ids[3]);
        });

        expect(
            queryClient
                .getQueryData(["activeChats"])
                .map((chat) => String(chat?._id)),
        ).toEqual([ids[3], ...ids.slice(0, 3)]);
        expect(queryClient.getQueryData(["userChatInfo"])).toEqual({
            activeChatId: ids[3],
            recentChatIds: [ids[3], ...ids.slice(0, 3)],
        });
    });
});
