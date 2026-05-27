"use client";
import {
    useQuery,
    useMutation,
    useQueryClient,
    useInfiniteQuery,
} from "@tanstack/react-query";
import axios from "../utils/axios-client";
import { isValidObjectId } from "../../src/utils/helper.js";
import { hasActiveStream } from "../../src/hooks/useStreamingMessages";
import { NEW_CHAT_ID, isClientOnlyChatId } from "../utils/chatClientIds";
import {
    DEFAULT_PAGE_SIZE,
    DEFAULT_CHAT_MESSAGES_LIMIT,
} from "../constants/chats";

export { DEFAULT_PAGE_SIZE, DEFAULT_CHAT_MESSAGES_LIMIT };

let clientMessageIdCounter = 0;

const nextClientMessageId = (chatId) =>
    `client-message:${String(chatId || "chat")}:${++clientMessageIdCounter}`;

const parsePossiblyJsonString = (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (
        !trimmed ||
        (!trimmed.startsWith("{") &&
            !trimmed.startsWith("[") &&
            !trimmed.startsWith('"'))
    ) {
        return value;
    }
    try {
        return JSON.parse(trimmed);
    } catch {
        return value;
    }
};

const getRefetchIntervalData = (queryOrData) =>
    queryOrData?.state?.data ?? queryOrData;

const stableSerialize = (value) => {
    const normalized = parsePossiblyJsonString(value);

    if (normalized === null || normalized === undefined) {
        return "";
    }

    if (Array.isArray(normalized)) {
        return `[${normalized.map(stableSerialize).join(",")}]`;
    }

    if (typeof normalized === "object") {
        return `{${Object.keys(normalized)
            .sort()
            .map((key) => `${key}:${stableSerialize(normalized[key])}`)
            .join(",")}}`;
    }

    return String(normalized);
};

export const getMessageSignature = (message) =>
    [
        message?.sender || "",
        message?.direction || "",
        message?.position || "",
        message?.entityId || "",
        message?.taskId || "",
        message?.tool || "",
        message?.text || "",
        stableSerialize(message?.payload),
    ].join("::");

const getExactMessageIdentityCandidates = (message) =>
    [message?._clientId, message?.id, message?._id]
        .filter(Boolean)
        .map((value) => String(value));

const getAssistantPayloadReconciliationValue = (payload) => {
    const normalizeItem = (item) => {
        const parsed = parsePossiblyJsonString(item);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return parsed;
        }

        if (parsed.type === "thinking") {
            return {
                type: parsed.type,
                text: parsed.text || "",
            };
        }

        if (parsed.type === "tool_event") {
            return {
                type: parsed.type,
                callId: parsed.callId || null,
                userMessage: parsed.userMessage || "",
                status: parsed.status || "",
                presentation: parsed.presentation || "default",
                error: parsed.error || null,
            };
        }

        if (parsed.type === "text") {
            return {
                type: parsed.type,
                text: parsed.text || "",
            };
        }

        return parsed;
    };

    if (Array.isArray(payload)) {
        return payload.map(normalizeItem);
    }

    return normalizeItem(payload);
};

const getLocalOptimisticReplacementKey = (message) => {
    if (!message) return null;

    const payload =
        message.sender === "assistant"
            ? getAssistantPayloadReconciliationValue(message.payload)
            : message.payload;

    return [
        message.sender || "",
        message.direction || "",
        message.position || "",
        stableSerialize(payload),
    ].join("::");
};

const normalizeChatMessagesForCache = (
    previousMessages,
    nextMessages,
    chatId,
) => {
    if (!Array.isArray(nextMessages)) return nextMessages;

    const previous = Array.isArray(previousMessages) ? previousMessages : [];
    const previousByIdentity = new Map();
    const previousBySignature = new Map();
    const usedPreviousMessages = new Set();

    previous.forEach((message) => {
        getExactMessageIdentityCandidates(message).forEach((candidate) => {
            if (!previousByIdentity.has(candidate)) {
                previousByIdentity.set(candidate, message);
            }
        });

        const signature = getMessageSignature(message);
        const queue = previousBySignature.get(signature) || [];
        queue.push(message);
        previousBySignature.set(signature, queue);
    });

    return nextMessages.map((message) => {
        let matchedPreviousMessage = null;

        for (const candidate of getExactMessageIdentityCandidates(message)) {
            const previousMessage = previousByIdentity.get(candidate);
            if (previousMessage && !usedPreviousMessages.has(previousMessage)) {
                matchedPreviousMessage = previousMessage;
                break;
            }
        }

        if (!matchedPreviousMessage) {
            const signature = getMessageSignature(message);
            const queue = previousBySignature.get(signature) || [];
            while (queue.length > 0) {
                const previousMessage = queue.shift();
                if (!usedPreviousMessages.has(previousMessage)) {
                    matchedPreviousMessage = previousMessage;
                    break;
                }
            }
        }

        if (matchedPreviousMessage) {
            usedPreviousMessages.add(matchedPreviousMessage);
        }

        const resolvedClientId =
            message?._clientId ||
            matchedPreviousMessage?._clientId ||
            nextClientMessageId(chatId);

        // Return the previous reference if the message is identical —
        // avoids creating new objects that bust React.memo shallow comparisons.
        // Also compare payload so in-place edits (mermaid fixes, file
        // deletions) are not silently dropped.
        if (
            matchedPreviousMessage &&
            resolvedClientId === matchedPreviousMessage._clientId &&
            message._id != null &&
            message._id === matchedPreviousMessage._id &&
            message.payload === matchedPreviousMessage.payload
        ) {
            return matchedPreviousMessage;
        }

        return {
            ...message,
            _clientId: resolvedClientId,
        };
    });
};

export const normalizeChatForCache = (previousChat, nextChat) => {
    if (!nextChat || typeof nextChat !== "object") return nextChat;

    const chatId = String(nextChat?._id || previousChat?._id || "chat");
    const nextMessages = Array.isArray(nextChat?.messages)
        ? normalizeChatMessagesForCache(
              previousChat?.messages,
              nextChat.messages,
              chatId,
          )
        : nextChat?.messages;

    // Reuse the previous object when nothing actually changed.
    // Mutations often spread { ...previousChat, ...updates } which creates a
    // new object even when scalar fields (selectedEntityId, isChatLoading, …)
    // are identical — this shallow-equality check prevents the new reference
    // from cascading unnecessary re-renders through the component tree.
    if (previousChat) {
        const merged = Array.isArray(nextMessages)
            ? { ...nextChat, messages: nextMessages }
            : { ...nextChat };
        const allKeys = Object.keys(merged);
        let same = allKeys.length === Object.keys(previousChat).length;
        if (same) {
            for (const key of allKeys) {
                if (merged[key] !== previousChat[key]) {
                    same = false;
                    break;
                }
            }
        }
        if (same) return previousChat;
        return merged;
    }

    return {
        ...nextChat,
        ...(Array.isArray(nextMessages) ? { messages: nextMessages } : {}),
    };
};

export const syncInFlightChatCache = (
    queryClient,
    chatId,
    {
        fallbackChat = null,
        serverChat = null,
        messages,
        activeSubscriptionId,
    } = {},
) => {
    if (!queryClient || !chatId) return null;

    const id = String(chatId);
    const chatKey = ["chat", id];
    const previousChat = queryClient.getQueryData(chatKey) || fallbackChat;
    const sourceChat = serverChat || previousChat || fallbackChat || {};
    const serverMessages = Array.isArray(serverChat?.messages)
        ? serverChat.messages
        : undefined;
    const cachedMessages = Array.isArray(previousChat?.messages)
        ? previousChat.messages
        : undefined;
    const sendingTs = queryClient.getQueryData(["chatSending", id]);
    const isSending = sendingTs && Date.now() - sendingTs < 15000;
    const shouldMergeServerMessages =
        serverMessages &&
        cachedMessages &&
        (isSending || cachedMessages.some(isLocalOnlyMessage));
    const nextMessages = Array.isArray(messages)
        ? messages
        : shouldMergeServerMessages
          ? mergeVisibleMessages(cachedMessages, serverMessages)
          : serverMessages || cachedMessages;
    const resolvedActiveSubscriptionId =
        activeSubscriptionId !== undefined
            ? activeSubscriptionId
            : serverChat?.activeSubscriptionId !== undefined
              ? serverChat.activeSubscriptionId
              : previousChat?.activeSubscriptionId;

    const nextChat = normalizeChatForCache(previousChat, {
        ...sourceChat,
        _id: id,
        title: sourceChat?.title || fallbackChat?.title || "",
        isTemporary: Boolean(sourceChat?.isTemporary) || isClientOnlyChatId(id),
        isUnused: false,
        isChatLoading: true,
        ...(Array.isArray(nextMessages) ? { messages: nextMessages } : {}),
        ...(resolvedActiveSubscriptionId !== undefined
            ? { activeSubscriptionId: resolvedActiveSubscriptionId }
            : {}),
    });

    queryClient.setQueryData(chatKey, nextChat);
    if (nextChat && !isClientOnlyChatId(id)) {
        syncChatToListCaches(queryClient, nextChat);
    }

    return nextChat;
};

const mergeChatIntoArray = (items, nextChat) => {
    if (!Array.isArray(items) || !nextChat?._id) {
        return items;
    }

    let changed = false;
    const targetId = String(nextChat._id);
    const nextItems = items.map((item) => {
        if (String(item?._id) !== targetId) {
            return item;
        }
        changed = true;
        return normalizeChatForCache(item, {
            ...item,
            ...nextChat,
        });
    });

    return changed ? nextItems : items;
};

const syncChatToActiveChats = (
    queryClient,
    nextChat,
    { insertIfMissing = false } = {},
) => {
    if (!queryClient || !nextChat?._id) return;

    queryClient.setQueryData(["activeChats"], (oldData = []) => {
        if (!Array.isArray(oldData)) {
            return insertIfMissing ? [nextChat] : oldData;
        }
        const merged = mergeChatIntoArray(oldData, nextChat);
        return insertIfMissing && merged === oldData
            ? [nextChat, ...oldData]
            : merged;
    });
};

export const ensureChatInActiveChats = (queryClient, nextChat) => {
    if (!queryClient || !nextChat?._id) return;
    syncChatToActiveChats(queryClient, nextChat, { insertIfMissing: true });
};

export const syncChatToListCaches = (queryClient, nextChat) => {
    if (!queryClient || !nextChat?._id) return;

    syncChatToActiveChats(queryClient, nextChat);

    queryClient.setQueryData(["chats"], (oldData) => {
        if (!oldData || !Array.isArray(oldData.pages)) {
            return oldData;
        }

        let changed = false;
        const nextPages = oldData.pages.map((page) => {
            const nextPage = mergeChatIntoArray(page, nextChat);
            if (nextPage !== page) {
                changed = true;
            }
            return nextPage;
        });

        return changed ? { ...oldData, pages: nextPages } : oldData;
    });
};

const syncChatCaches = (queryClient, chatId, nextChat) => {
    if (!queryClient || !chatId || !nextChat) return;

    queryClient.setQueryData(["chat", String(chatId)], nextChat);
    syncChatToListCaches(queryClient, nextChat);
};

const getMergedMessageKey = (message) => {
    const persistedId = message?._id || message?.id;
    if (persistedId) {
        return `id:${String(persistedId)}`;
    }

    if (message?._clientId) {
        return `client:${String(message._clientId)}`;
    }

    if (message?.sentTime) {
        return `time:${message.sentTime}`;
    }
    return `sig:${getMessageSignature(message)}`;
};

const isLocalOnlyMessage = (message) =>
    Boolean(message?._clientId) && !message?._id && !message?.id;

const mergeVisibleMessages = (cachedMessages, serverMessages) => {
    const mergedMessages = [...cachedMessages];
    const cachedMessagePositions = new Map();
    const localOnlySignaturePositions = new Map();
    const localOnlyReplacementPositions = new Map();

    const pushPosition = (map, key, index) => {
        const positions = map.get(key) || [];
        positions.push(index);
        map.set(key, positions);
    };

    cachedMessages.forEach((message, index) => {
        pushPosition(
            cachedMessagePositions,
            getMergedMessageKey(message),
            index,
        );
        if (isLocalOnlyMessage(message)) {
            pushPosition(
                localOnlySignaturePositions,
                getMessageSignature(message),
                index,
            );
            pushPosition(
                localOnlyReplacementPositions,
                getLocalOptimisticReplacementKey(message),
                index,
            );
        }
    });

    const usedCachedIndexes = new Set();
    const takePosition = (map, key) => {
        const positions = map.get(key) || [];
        while (positions.length > 0) {
            const index = positions.shift();
            if (!usedCachedIndexes.has(index)) {
                usedCachedIndexes.add(index);
                return index;
            }
        }
        return undefined;
    };

    serverMessages.forEach((message) => {
        const existingIndex =
            takePosition(
                cachedMessagePositions,
                getMergedMessageKey(message),
            ) ??
            takePosition(
                localOnlySignaturePositions,
                getMessageSignature(message),
            ) ??
            takePosition(
                localOnlyReplacementPositions,
                getLocalOptimisticReplacementKey(message),
            );
        if (existingIndex === undefined) {
            mergedMessages.push(message);
            return;
        }
        mergedMessages[existingIndex] = message;
    });

    return mergedMessages;
};

export const mergeFetchedChatResponse = (
    queryClient,
    chatId,
    cachedChat,
    serverChat,
) => {
    const chatIdString = String(chatId);
    const cachedMessages = cachedChat?.messages;
    const serverMessages = serverChat?.messages;
    const sendingTs = queryClient.getQueryData(["chatSending", chatIdString]);
    const isSending = sendingTs && Date.now() - sendingTs < 15000;
    const shouldPreserveVisibleHistory =
        serverChat?.messagesTruncated ||
        serverChat?.hasMoreMessages ||
        cachedChat?.messagesTruncated ||
        cachedChat?.hasMoreMessages;
    const hasLocalOnlyMessages =
        Array.isArray(cachedMessages) &&
        cachedMessages.some(isLocalOnlyMessage);

    if (Array.isArray(cachedMessages) && Array.isArray(serverMessages)) {
        const mergedMessages =
            isSending || shouldPreserveVisibleHistory || hasLocalOnlyMessages
                ? mergeVisibleMessages(cachedMessages, serverMessages)
                : serverMessages;

        if (mergedMessages !== serverMessages) {
            return {
                ...serverChat,
                messages: mergedMessages,
                isChatLoading:
                    Boolean(cachedChat?.isChatLoading) ||
                    Boolean(serverChat?.isChatLoading),
                isUnused:
                    cachedChat?.isUnused === false
                        ? false
                        : serverChat?.isUnused,
            };
        }
    }

    return serverChat;
};

const ensureChatMarkedUsed = (queryClient, chatId) => {
    if (!queryClient || !chatId) return;
    const id = String(chatId);
    // Check if this chat was previously unused before marking it
    const prevChat = queryClient.getQueryData(["chat", id]);
    const wasUnused = prevChat?.isUnused;
    const markUsed = (chat) =>
        chat && chat.isUnused ? { ...chat, isUnused: false } : chat;
    queryClient.setQueryData(["chat", id], (prev) => markUsed(prev));
    queryClient.setQueryData(["activeChats"], (oldData = []) => {
        const safe = Array.isArray(oldData) ? oldData : [];
        let updated = false;
        const mapped = safe.map((chat) => {
            if (String(chat?._id) !== id) return chat;
            if (!chat?.isUnused) return chat;
            updated = true;
            return { ...chat, isUnused: false };
        });
        return updated ? mapped : safe;
    });
    queryClient.setQueryData(["chats"], (oldData) => {
        if (!oldData || !oldData.pages) return oldData;
        let changed = false;
        const pages = oldData.pages.map((page) => {
            if (!Array.isArray(page)) return page;
            const mapped = page.map((chat) => {
                if (String(chat?._id) !== id) return chat;
                if (!chat?.isUnused) return chat;
                changed = true;
                return { ...chat, isUnused: false };
            });
            return mapped;
        });
        return changed ? { ...oldData, pages } : oldData;
    });
    queryClient.setQueryData(["userChatInfo"], (oldData = {}) => {
        const activeId = oldData.activeChatId;
        if (activeId && String(activeId) !== id) return oldData;
        if (activeId && activeId !== id && String(activeId) === id) {
            return { ...oldData, activeChatId: id };
        }
        return oldData;
    });
    // A previously-unused prefetched chat just became a real chat —
    // bump the total count optimistically and refetch from server
    if (wasUnused) {
        queryClient.setQueryData(["totalChatCount"], (old) =>
            typeof old === "number" ? old + 1 : old,
        );
        queryClient.invalidateQueries({ queryKey: ["totalChatCount"] });
    }
};

export function useGetChats({ initialPage } = {}) {
    return useInfiniteQuery({
        queryKey: ["chats"],
        queryFn: async ({ pageParam = 1 }) => {
            const response = await axios.get(`/api/chats?page=${pageParam}`);
            return response.data;
        },
        getNextPageParam: (lastPage, allPages) => {
            // If the last page has fewer items than the page size, we've reached the end
            if (lastPage.length < DEFAULT_PAGE_SIZE) {
                return undefined;
            }
            // Otherwise, return the next page number
            return allPages.length + 1;
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
        initialData: initialPage
            ? { pages: [initialPage], pageParams: [1] }
            : undefined,
    });
}

export function useGetActiveChats({ initialData } = {}) {
    const queryClient = useQueryClient();
    return useQuery({
        queryKey: ["activeChats"],
        queryFn: async () => {
            const response = await axios.get(`/api/chats/active/detail`);
            const activeChats = response.data;

            // Process each chat and ensure isUnused is correctly set
            const processedChats = activeChats.map((chat) => {
                const existingChat =
                    queryClient.getQueryData(["chat", chat._id]) || {};

                // If chat has a firstMessage property but the existing chat has a full messages array,
                // keep the existing messages and don't overwrite with the truncated version
                const updatedChat = { ...existingChat, ...chat };

                // Only preserve existing messages if they exist and are not empty
                if (
                    chat.firstMessage &&
                    existingChat.messages &&
                    existingChat.messages.length > 0
                ) {
                    updatedChat.messages = existingChat.messages;
                }

                // CRITICAL: Always use server's isUnused value, never preserve from cache
                // This prevents old chats with stale isUnused:true from being reused
                if (chat.hasOwnProperty("isUnused")) {
                    updatedChat.isUnused = chat.isUnused;
                } else {
                    // If server didn't send isUnused, it's an old chat - mark as used
                    updatedChat.isUnused = false;
                }

                // Update individual chat cache
                queryClient.setQueryData(["chat", chat._id], updatedChat);

                // Return the processed chat with correct isUnused for activeChats array
                return updatedChat;
            });

            return processedChats;
        },
        initialData,
        initialDataUpdatedAt: initialData ? Date.now() : undefined,
        staleTime: 1000 * 60 * 5,
        refetchInterval: (query) => {
            const data = getRefetchIntervalData(query);
            // Only poll if there are active chats
            return Array.isArray(data) && data.length > 0 ? 20000 : false;
        },
    });
}

// Search chats by title (server side)
export function useSearchChats(searchQuery, { limit = 20 } = {}) {
    return useQuery({
        queryKey: ["searchChats", searchQuery, limit],
        queryFn: async () => {
            if (!searchQuery) return [];
            const response = await axios.get(
                `/api/chats?search=${encodeURIComponent(searchQuery)}&limit=${limit}`,
            );
            return response.data || [];
        },
        enabled:
            typeof searchQuery === "string" && searchQuery.trim().length > 0,
        staleTime: 1000 * 30,
    });
}
// Server-side content search (CSFLE-safe) scanning recent chats
export function useSearchContent(searchQuery, { limit = 20 } = {}) {
    return useQuery({
        queryKey: ["searchContent", searchQuery, limit],
        queryFn: async () => {
            if (!searchQuery) return [];
            const response = await axios.get(
                `/api/chats?content=${encodeURIComponent(searchQuery)}&limit=${limit}`,
            );
            const data = Array.isArray(response.data) ? response.data : [];
            return data.slice(0, limit);
        },
        enabled:
            typeof searchQuery === "string" && searchQuery.trim().length > 0,
        staleTime: 1000 * 30,
    });
}

// Total chat count for current user
export function useTotalChatCount({ enabled = true } = {}) {
    return useQuery({
        queryKey: ["totalChatCount"],
        queryFn: async () => {
            const response = await axios.get(`/api/chats/count`);
            return Number(response.data || 0);
        },
        enabled,
        staleTime: 1000 * 10,
    });
}

export function useAddChat() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            messages,
            messageList,
            title,
            forceNew,
            isUnused,
        }) => {
            const normalizedMessages = Array.isArray(messages)
                ? messages
                : Array.isArray(messageList)
                  ? messageList
                  : messages || messageList
                    ? [messages || messageList]
                    : [];
            const query = forceNew ? "?forceNew=true" : "";
            const response = await axios.post(`/api/chats${query}`, {
                messages: normalizedMessages,
                title,
                isUnused,
            });
            return response.data;
        },
        onSuccess: (serverChat) => {
            const previousChat = queryClient.getQueryData([
                "chat",
                String(serverChat?._id),
            ]);
            queryClient.setQueryData(
                ["chat", String(serverChat?._id)],
                normalizeChatForCache(previousChat, serverChat),
            );
            queryClient.invalidateQueries({ queryKey: ["chats"] });
            queryClient.invalidateQueries({ queryKey: ["activeChats"] });
            queryClient.invalidateQueries({ queryKey: ["userChatInfo"] });
            queryClient.invalidateQueries({ queryKey: ["totalChatCount"] });
            // Ensure title search results include newly added chats immediately
            queryClient.invalidateQueries({ queryKey: ["searchChats"] });
            // Ensure server-side content search includes newly added chats immediately
            queryClient.invalidateQueries({ queryKey: ["searchContent"] });
        },
    });
}

export function useAddMessage() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ message, chatId }) => {
            if (!chatId || isClientOnlyChatId(chatId)) {
                throw new Error("chatId is required to persist a message");
            }
            const chatResponse = await axios.post(
                `/api/chats/${String(chatId)}`,
                { message },
            );
            return chatResponse.data;
        },
        onSuccess: (chat, variables) => {
            if (variables?.skipCacheUpdate) return;
            const previousChat = queryClient.getQueryData([
                "chat",
                String(chat?._id || variables?.chatId),
            ]);
            const normalizedChat = normalizeChatForCache(previousChat, chat);
            queryClient.setQueryData(
                ["chat", String(chat?._id || variables?.chatId)],
                normalizedChat,
            );
            syncChatToListCaches(queryClient, normalizedChat);
        },
    });
}

export function useDeleteChat() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ chatId }) => {
            if (!chatId || chatId === "undefined" || !isValidObjectId(chatId))
                return;
            const response = await axios.delete(`/api/chats/${String(chatId)}`);
            return response.data;
        },
        onMutate: async ({ chatId }) => {
            if (!isValidObjectId(chatId)) return;
            const targetId = String(chatId);
            await queryClient.cancelQueries({ queryKey: ["userChatInfo"] });
            await queryClient.cancelQueries({ queryKey: ["activeChats"] });
            await queryClient.cancelQueries({ queryKey: ["chats"] });
            const previousActiveChats =
                queryClient.getQueryData(["activeChats"]) || [];
            const previousUserChatInfo =
                queryClient.getQueryData(["userChatInfo"]) || {};
            const previousChats = queryClient.getQueryData(["chats"]);

            const updatedActiveChats = previousActiveChats.filter(
                (chat) => String(chat?._id) !== targetId,
            );
            const nextActiveId = updatedActiveChats[0]?._id
                ? String(updatedActiveChats[0]._id)
                : null;

            const updatedUserChatInfo = {
                ...previousUserChatInfo,
                recentChatIds:
                    previousUserChatInfo.recentChatIds?.filter(
                        (id) => String(id) !== targetId,
                    ) || [],
            };
            if (String(updatedUserChatInfo.activeChatId || "") === targetId) {
                updatedUserChatInfo.activeChatId = nextActiveId;
            }

            queryClient.setQueryData(["activeChats"], updatedActiveChats);
            queryClient.setQueryData(["userChatInfo"], updatedUserChatInfo);
            queryClient.removeQueries({ queryKey: ["chat", targetId] });

            // Optimistically remove from chats infinite list
            queryClient.setQueryData(["chats"], (old) => {
                if (!old || !old.pages) return old;
                return {
                    ...old,
                    pages: old.pages.map((page) =>
                        Array.isArray(page)
                            ? page.filter(
                                  (chat) => String(chat?._id) !== targetId,
                              )
                            : page,
                    ),
                };
            });

            return {
                previousActiveChats,
                previousUserChatInfo,
                previousChats,
            };
        },
        onError: (err, variables, context) => {
            if (context?.previousActiveChats) {
                queryClient.setQueryData(
                    ["activeChats"],
                    context.previousActiveChats,
                );
            }
            if (context?.previousUserChatInfo) {
                queryClient.setQueryData(
                    ["userChatInfo"],
                    context.previousUserChatInfo,
                );
            }
            if (context?.previousChats) {
                queryClient.setQueryData(["chats"], context.previousChats);
            }
        },
        onSuccess: (data) => {
            if (data?.recentChatIds) {
                queryClient.setQueryData(["userChatInfo"], data);

                const activeChats =
                    queryClient.getQueryData(["activeChats"]) || [];
                const chats = queryClient.getQueryData(["chats"]);
                const chatMap = new Map();

                if (Array.isArray(activeChats)) {
                    activeChats.forEach((chat) => {
                        if (chat?._id) {
                            chatMap.set(String(chat._id), chat);
                        }
                    });
                }

                if (chats?.pages) {
                    chats.pages.forEach((page) => {
                        if (!Array.isArray(page)) return;
                        page.forEach((chat) => {
                            if (chat?._id) {
                                chatMap.set(String(chat._id), chat);
                            }
                        });
                    });
                }

                const ordered = data.recentChatIds
                    .map((id) => chatMap.get(String(id)))
                    .filter(Boolean);
                if (ordered.length > 0) {
                    queryClient.setQueryData(["activeChats"], ordered);
                }
            }

            queryClient.invalidateQueries({ queryKey: ["chats"] });
            queryClient.invalidateQueries({ queryKey: ["totalChatCount"] });
            queryClient.invalidateQueries({ queryKey: ["searchChats"] });
            queryClient.invalidateQueries({ queryKey: ["searchContent"] });
        },
    });
}

export function useBulkImportChats() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ chats }) => {
            if (!Array.isArray(chats)) {
                throw new Error("chats must be an array");
            }
            const response = await axios.post(`/api/chats/bulk`, { chats });
            const data = response.data || {};
            return {
                createdIds: Array.isArray(data.createdIds)
                    ? data.createdIds.map((id) => String(id))
                    : [],
                createdChats: Array.isArray(data.createdChats)
                    ? data.createdChats
                    : [],
                errors: Array.isArray(data.errors) ? data.errors : [],
                createdCount: Number.isFinite(data.createdCount)
                    ? data.createdCount
                    : 0,
            };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["chats"] });
            queryClient.invalidateQueries({ queryKey: ["activeChats"] });
            queryClient.invalidateQueries({ queryKey: ["userChatInfo"] });
            queryClient.invalidateQueries({ queryKey: ["totalChatCount"] });
            queryClient.invalidateQueries({ queryKey: ["searchChats"] });
            queryClient.invalidateQueries({ queryKey: ["searchContent"] });
        },
    });
}

export function useBulkDeleteChats() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ chatIds }) => {
            if (!Array.isArray(chatIds)) {
                throw new Error("chatIds must be an array");
            }
            const response = await axios.delete(`/api/chats/bulk`, {
                data: { chatIds },
            });
            const data = response.data || {};
            return {
                deletedIds: Array.isArray(data.deletedIds)
                    ? data.deletedIds.map((id) => String(id))
                    : [],
                missingIds: Array.isArray(data.missingIds)
                    ? data.missingIds.map((id) => String(id))
                    : [],
            };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["userChatInfo"] });
            queryClient.invalidateQueries({ queryKey: ["activeChats"] });
            queryClient.invalidateQueries({ queryKey: ["chats"] });
            queryClient.invalidateQueries({ queryKey: ["totalChatCount"] });
            queryClient.invalidateQueries({ queryKey: ["searchChats"] });
            queryClient.invalidateQueries({ queryKey: ["searchContent"] });
        },
    });
}

const userChatInfoQueryFn = async () => {
    const response = await axios.get(`/api/chats/active`);
    return response.data;
};

export function useGetUserChatInfo() {
    return useQuery({
        queryKey: ["userChatInfo"],
        queryFn: userChatInfoQueryFn,
        staleTime: 1000 * 60 * 5,
    });
}

export function useGetActiveChatId() {
    // Use `select` so React Query only triggers a re-render when
    // activeChatId actually changes, not on every userChatInfo refetch.
    const { data: activeChatId } = useQuery({
        queryKey: ["userChatInfo"],
        queryFn: userChatInfoQueryFn,
        select: (data) => data?.activeChatId,
        staleTime: 1000 * 60 * 5,
    });
    return activeChatId;
}

export function useGetChatById(
    chatId,
    { pollOnLoading = true, notifyOnChangeProps } = {},
) {
    const queryClient = useQueryClient();

    const cachedChat = chatId
        ? queryClient.getQueryData(["chat", chatId])
        : null;
    const streamActive = chatId
        ? hasActiveStream(queryClient, String(chatId))
        : false;
    const sendingTs = chatId
        ? queryClient.getQueryData(["chatSending", String(chatId)])
        : null;
    const isSending = sendingTs && Date.now() - sendingTs < 15000;
    const missingMessages = cachedChat && !Array.isArray(cachedChat?.messages);
    const shouldForceRefetch =
        pollOnLoading &&
        !streamActive &&
        !isSending &&
        (Boolean(cachedChat?.isChatLoading) ||
            (missingMessages && cachedChat?.messagesTruncated === undefined));

    return useQuery({
        queryKey: ["chat", chatId],
        queryFn: async () => {
            if (!chatId) throw new Error("chatId is required");

            if (chatId === NEW_CHAT_ID) {
                const cachedNew = queryClient.getQueryData(["chat", chatId]);
                if (cachedNew) return cachedNew;
                return {
                    _id: NEW_CHAT_ID,
                    title: "",
                    messages: [],
                    isPublic: false,
                    readOnly: false,
                    isChatLoading: false,
                    isTemporary: true,
                    isUnused: true,
                    hasMoreMessages: false,
                    messagesTruncated: false,
                };
            }

            const cachedForFetch = queryClient.getQueryData(["chat", chatId]);
            const shouldLimit =
                !cachedForFetch || cachedForFetch.messagesTruncated !== false;
            const chatUrl = shouldLimit
                ? `/api/chats/${String(chatId)}?limit=${DEFAULT_CHAT_MESSAGES_LIMIT}`
                : `/api/chats/${String(chatId)}`;

            const response = await axios.get(chatUrl);
            const cachedAfterFetch = queryClient.getQueryData(["chat", chatId]);
            return normalizeChatForCache(
                cachedAfterFetch,
                mergeFetchedChatResponse(
                    queryClient,
                    chatId,
                    cachedAfterFetch,
                    response.data,
                ),
            );
        },
        enabled: !!chatId,
        // Always refetch on mount to get fresh isChatLoading state
        // Server sets isChatLoading: true when stream starts, false when it completes
        staleTime: shouldForceRefetch ? 0 : 1000 * 15, // Avoid refetching on quick switches
        refetchOnMount: shouldForceRefetch ? "always" : "ifStale",
        refetchOnWindowFocus: isClientOnlyChatId(chatId)
            ? false
            : shouldForceRefetch,
        ...(notifyOnChangeProps ? { notifyOnChangeProps } : {}),
        refetchInterval: (query) => {
            const data = getRefetchIntervalData(query);
            if (isClientOnlyChatId(chatId)) return false;
            if (!pollOnLoading || !data?.isChatLoading) return false;
            if (hasActiveStream(queryClient, String(chatId))) return false;
            // Don't poll while a message send is in progress but the
            // SSE stream hasn't been established yet
            const sendingTs = queryClient.getQueryData([
                "chatSending",
                String(chatId),
            ]);
            if (sendingTs && Date.now() - sendingTs < 15000) return false;
            return 1000;
        },
    });
}

export function useGetActiveChat(options = {}) {
    const activeChatId = useGetActiveChatId();
    return useGetChatById(activeChatId, options);
}

const normalizeActiveChatIdInput = (input) =>
    input && typeof input === "object" ? input.activeChatId : input;

const buildRecentChatIds = (previousData, activeChatId) => [
    String(activeChatId),
    ...(Array.isArray(previousData?.recentChatIds)
        ? previousData.recentChatIds.map(String)
        : []
    ).filter((id) => id !== String(activeChatId)),
];

const buildUserChatInfo = (previousData, activeChatId) => ({
    ...(previousData || {}),
    activeChatId: String(activeChatId),
    recentChatIds: buildRecentChatIds(previousData, activeChatId),
});

const reorderActiveChats = (activeChats, activeChatId, cachedChat) => {
    if (!Array.isArray(activeChats)) {
        return cachedChat ? [cachedChat] : activeChats;
    }

    const targetId = String(activeChatId);
    const existingIndex = activeChats.findIndex(
        (chat) => String(chat?._id) === targetId,
    );

    if (existingIndex === 0) {
        return activeChats;
    }

    const nextChat = cachedChat || activeChats[existingIndex];
    return nextChat
        ? [
              nextChat,
              ...activeChats.filter((chat) => String(chat?._id) !== targetId),
          ]
        : activeChats;
};

export function useSetActiveChatId() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input) => {
            const activeChatId = normalizeActiveChatIdInput(input);
            if (!activeChatId || !isValidObjectId(activeChatId)) {
                throw new Error(
                    "activeChatId is required and must be a valid Mongo ID",
                );
            }

            const { data } = await axios.put(`/api/chats/active`, {
                activeChatId,
            });
            return data;
        },
        onMutate: async (input) => {
            const activeChatId = normalizeActiveChatIdInput(input);
            if (!isValidObjectId(activeChatId)) return;

            const previousData = queryClient.getQueryData(["userChatInfo"]);
            const previousActiveChats = queryClient.getQueryData([
                "activeChats",
            ]);

            await queryClient.cancelQueries({ queryKey: ["userChatInfo"] });
            await queryClient.cancelQueries({ queryKey: ["activeChats"] });
            queryClient.setQueryData(
                ["userChatInfo"],
                buildUserChatInfo(previousData, activeChatId),
            );
            queryClient.setQueryData(["activeChats"], (activeChats) =>
                reorderActiveChats(
                    activeChats,
                    activeChatId,
                    queryClient.getQueryData(["chat", String(activeChatId)]),
                ),
            );

            return { previousData, previousActiveChats };
        },
        onError: (err, variables, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(
                    ["userChatInfo"],
                    context.previousData,
                );
            }
            if (context?.previousActiveChats) {
                queryClient.setQueryData(
                    ["activeChats"],
                    context.previousActiveChats,
                );
            }
        },
        onSuccess: (data) => {
            queryClient.setQueryData(["userChatInfo"], data);
            queryClient.invalidateQueries({ queryKey: ["activeChats"] });
            queryClient.invalidateQueries({ queryKey: ["chats"] });
        },
    });
}

export function useUpdateChat() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ chatId, ...updateData }) => {
            if (!chatId || chatId === "undefined") {
                throw new Error("chatId is required");
            }

            // Get the mutation timestamp that was set in onMutate (before making the request)
            const timestamp =
                queryClient.getQueryData(["chatMutationTimestamp", chatId]) ||
                Date.now();

            const response = await axios.put(
                `/api/chats/${String(chatId)}`,
                updateData,
            );

            return { data: response.data, timestamp };
        },
        onMutate: async ({ chatId, ...updateData }) => {
            const cancelChatQuery = queryClient.cancelQueries({
                queryKey: ["chat", chatId],
            });
            const cancelChatsQuery = queryClient.cancelQueries({
                queryKey: ["chats"],
            });
            const cancelActiveChatsQuery = queryClient.cancelQueries({
                queryKey: ["activeChats"],
            });

            const requestTimestamp = Date.now();
            queryClient.setQueryData(
                ["chatMutationTimestamp", chatId],
                requestTimestamp,
            );

            const previousChat = queryClient.getQueryData(["chat", chatId]);
            const previousChats = queryClient.getQueryData(["chats"]);
            const previousActiveChats = queryClient.getQueryData([
                "activeChats",
            ]);
            let expectedChatData = normalizeChatForCache(previousChat, {
                ...previousChat,
                ...updateData,
            });

            if (Object.prototype.hasOwnProperty.call(updateData, "messages")) {
                const { messages, ...otherUpdates } = updateData;
                const nextMessages = Array.isArray(messages) ? messages : [];
                const clearStorageStatus =
                    nextMessages.length === 0
                        ? {
                              messageStorageBytes: 0,
                              messagesCompacted: false,
                              messagesCompactedAt: null,
                          }
                        : {};

                expectedChatData = normalizeChatForCache(previousChat, {
                    ...previousChat,
                    ...otherUpdates,
                    ...clearStorageStatus,
                    messages: nextMessages,
                });

                if (nextMessages.length > 0) {
                    ensureChatMarkedUsed(queryClient, chatId);
                }
            }

            syncChatCaches(queryClient, chatId, expectedChatData);
            await Promise.all([
                cancelChatQuery,
                cancelChatsQuery,
                cancelActiveChatsQuery,
            ]);

            return {
                previousChat,
                previousChats,
                previousActiveChats,
                timestamp: requestTimestamp,
            };
        },
        onError: (err, variables, context) => {
            if (context?.previousChat) {
                queryClient.setQueryData(
                    ["chat", variables.chatId],
                    context.previousChat,
                );
            }
            if (context?.previousChats) {
                queryClient.setQueryData(["chats"], context.previousChats);
            }
            if (context?.previousActiveChats) {
                queryClient.setQueryData(
                    ["activeChats"],
                    context.previousActiveChats,
                );
            }
        },
        onSuccess: (result, variables) => {
            const chatId = variables?.chatId;
            const { data: updatedChat, timestamp } = result;
            const cachedChat = queryClient.getQueryData(["chat", chatId]);
            const hasMessageUpdate = Object.prototype.hasOwnProperty.call(
                variables || {},
                "messages",
            );
            const nextChat = normalizeChatForCache(
                cachedChat,
                !hasMessageUpdate && cachedChat
                    ? {
                          ...cachedChat,
                          ...updatedChat,
                          messages: Array.isArray(cachedChat?.messages)
                              ? cachedChat.messages
                              : updatedChat.messages,
                      }
                    : updatedChat,
            );

            // Check if a newer mutation has happened (queries use separate timestamp key)
            const currentMutationTimestamp =
                queryClient.getQueryData(["chatMutationTimestamp", chatId]) ||
                0;
            if (timestamp < currentMutationTimestamp) {
                // Another mutation happened after this one - ignore this response
                return;
            }

            // Always use server response - it has the latest state including server-persisted messages
            syncChatCaches(queryClient, chatId, nextChat);
        },
    });
}

export function useUpdateActiveChat() {
    const queryClient = useQueryClient();
    const updateChatMutation = useUpdateChat();

    return {
        ...updateChatMutation,
        mutateAsync: async (updateData) => {
            const activeChatId = queryClient.getQueryData([
                "userChatInfo",
            ])?.activeChatId;
            if (!activeChatId || !updateData) {
                throw new Error("activeChatId and updateData are required");
            }
            return updateChatMutation.mutateAsync({
                chatId: activeChatId,
                ...updateData,
            });
        },
    };
}
