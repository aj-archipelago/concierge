import {
    useQuery,
    useMutation,
    useQueryClient,
    useInfiniteQuery,
} from "@tanstack/react-query";
import axios from "../utils/axios-client";
import { isValidObjectId } from "../../src/utils/helper.js";

export const DEFAULT_PAGE_SIZE = 10;

export function useTotalChatCount() {
    return useQuery({
        queryKey: ["totalChatCount"],
        queryFn: async () => {
            const response = await axios.get("/api/chats/count");
            return response.data.total;
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

export function useSearchChats(searchTerm) {
    return useQuery({
        queryKey: ["searchChats", searchTerm],
        queryFn: async () => {
            if (!searchTerm || searchTerm.length < 1) return [];
            const response = await axios.get(
                `/api/chats?search=${encodeURIComponent(searchTerm)}`,
            );
            return response.data;
        },
        enabled: !!searchTerm && searchTerm.length >= 1,
        staleTime: 1000 * 60 * 2, // 2 minutes
    });
}

export function useGetChats() {
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
    });
}

export function useGetActiveChats() {
    const queryClient = useQueryClient();
    return useQuery({
        queryKey: ["activeChats"],
        queryFn: async () => {
            const response = await axios.get(`/api/chats/active/detail`);
            const activeChats = response.data;
            activeChats.forEach((chat) => {
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

                queryClient.setQueryData(["chat", chat._id], updatedChat);
            });
            return activeChats;
        },
        staleTime: 1000 * 60 * 5,
        refetchInterval: (data) => {
            // Only poll if there are active chats
            return data && data.length > 0 ? 5000 : false;
        },
    });
}

function temporaryNewChat({ messages, title }) {
    const tempId = `temp_${Date.now()}_${crypto.randomUUID()}`;
    return {
        _id: tempId,
        messages: messages || [],
        title: title || "",
        isTemporary: true,
    };
}

export function useAddChat() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ messages, title }) => {
            const response = await axios.post(`/api/chats`, {
                messages,
                title,
            });
            return response.data;
        },
        // Using the standard Tanstack Query pattern for optimistic updates
        onMutate: async (newChatData) => {
            // Cancel related queries to prevent race conditions
            await queryClient.cancelQueries({
                queryKey: ["activeChats", "userChatInfo", "chats"],
            });

            // Snapshot the current state
            const previousActiveChats =
                queryClient.getQueryData(["activeChats"]) || [];
            const previousUserChatInfo =
                queryClient.getQueryData(["userChatInfo"]) || {};

            // Create an optimistic chat entry
            const optimisticChat = temporaryNewChat(newChatData);

            // Update all relevant query data optimistically
            queryClient.setQueryData(
                ["chat", optimisticChat._id],
                optimisticChat,
            );
            queryClient.setQueryData(
                ["activeChats"],
                [optimisticChat, ...previousActiveChats],
            );
            queryClient.setQueryData(["userChatInfo"], {
                ...previousUserChatInfo,
                activeChatId: optimisticChat._id,
                recentChatIds: previousUserChatInfo.recentChatIds
                    ? [
                          optimisticChat._id,
                          ...previousUserChatInfo.recentChatIds
                              .filter((id) => id !== optimisticChat._id)
                              .slice(0, 2),
                      ]
                    : [optimisticChat._id],
            });

            // Return context for potential rollback
            return {
                previousActiveChats,
                previousUserChatInfo,
                optimisticChatId: optimisticChat._id,
            };
        },
        onError: (err, newChat, context) => {
            // On error, roll back to the previous state
            if (context) {
                queryClient.setQueryData(
                    ["activeChats"],
                    context.previousActiveChats,
                );
                queryClient.setQueryData(
                    ["userChatInfo"],
                    context.previousUserChatInfo,
                );
                queryClient.removeQueries({
                    queryKey: ["chat", context.optimisticChatId],
                });
            }
        },
        onSuccess: (serverChat, variables, context) => {
            // Remove the optimistic entry
            if (context?.optimisticChatId) {
                queryClient.removeQueries({
                    queryKey: ["chat", context.optimisticChatId],
                });
            }

            // Add the confirmed server data
            queryClient.setQueryData(["chat", serverChat._id], serverChat);

            // Update active chats by replacing the optimistic version
            queryClient.setQueryData(["activeChats"], (oldData = []) => {
                return [
                    serverChat,
                    ...oldData.filter(
                        (chat) =>
                            chat._id !== context?.optimisticChatId &&
                            chat._id !== serverChat._id,
                    ),
                ];
            });

            // Update the userChatInfo with the actual chat ID
            queryClient.setQueryData(["userChatInfo"], (oldData = {}) => {
                return {
                    ...oldData,
                    activeChatId: serverChat._id,
                    recentChatIds: oldData.recentChatIds
                        ? [
                              serverChat._id,
                              ...oldData.recentChatIds.filter(
                                  (id) =>
                                      id !== context?.optimisticChatId &&
                                      id !== serverChat._id,
                              ),
                          ]
                        : [serverChat._id],
                };
            });
        },
        onSettled: () => {
            // Always refresh the data to ensure consistency
            queryClient.invalidateQueries({ queryKey: ["chats"] });
            queryClient.invalidateQueries({ queryKey: ["activeChats"] });
            queryClient.invalidateQueries({ queryKey: ["userChatInfo"] });
        },
    });
}

// The useAddMessage function will now automatically leverage the optimistic behavior
// of useAddChat if no chatId is provided
export function useAddMessage() {
    const queryClient = useQueryClient();
    const addChatMutation = useAddChat();

    return useMutation({
        mutationFn: async ({ message, chatId }) => {
            let chatData;
            if (!chatId) {
                // No changes needed here - the optimistic updates are handled in useAddChat
                const newChat = await addChatMutation.mutateAsync({
                    messages: [message],
                });
                chatId = String(newChat?._id);
                chatData = newChat;
            } else {
                const chatResponse = await axios.post(
                    `/api/chats/${String(chatId)}`,
                    { message },
                );
                chatData = chatResponse.data;
                queryClient.setQueryData(["chat", String(chatId)], chatData);
            }
            return chatData;
        },
        onMutate: ({ message, chatId }) => {
            if (!chatId || !message) return;
            const existingChat = queryClient.getQueryData([
                "chat",
                String(chatId),
            ]);
            const expectedChatData = {
                ...existingChat,
                messages: [...(existingChat?.messages || []), message],
            };
            queryClient.setQueryData(
                ["chat", String(chatId)],
                expectedChatData,
            );
        },
        onSuccess: (updatedChat) => {
            queryClient.setQueryData(
                ["chat", String(updatedChat?._id)],
                updatedChat,
            );
        },
        onError: (err, variables, context) => {
            if (context?.previousChat) {
                queryClient.setQueryData(
                    ["chat", String(context.previousChat._id)],
                    context.previousChat,
                );
            }
        },
    });
}

export function useDeleteChat() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ chatId }) => {
            if (!chatId || !isValidObjectId(chatId)) return;
            const response = await axios.delete(`/api/chats/${String(chatId)}`);
            return response.data;
        },
        onMutate: async ({ chatId }) => {
            if (!isValidObjectId(chatId)) return;
            await queryClient.cancelQueries({ queryKey: ["userChatInfo"] });
            await queryClient.cancelQueries({ queryKey: ["activeChats"] });
            await queryClient.cancelQueries({ queryKey: ["chats"] });
            const previousActiveChats =
                queryClient.getQueryData(["activeChats"]) || [];
            const previousUserChatInfo =
                queryClient.getQueryData(["userChatInfo"]) || {};

            const updatedActiveChats = previousActiveChats.filter(
                (chat) => chat._id !== chatId,
            );

            if (updatedActiveChats.length === 0)
                updatedActiveChats.push(temporaryNewChat({}));

            const updatedUserChatInfo = {
                ...previousUserChatInfo,
                recentChatIds:
                    previousUserChatInfo.recentChatIds?.filter(
                        (id) => id !== chatId,
                    ) || [],
            };
            if (updatedUserChatInfo.activeChatId === chatId) {
                updatedUserChatInfo.activeChatId = updatedActiveChats[0]._id;
            }

            queryClient.setQueryData(["activeChats"], updatedActiveChats);
            queryClient.setQueryData(["userChatInfo"], updatedUserChatInfo);

            return { previousActiveChats, previousUserChatInfo };
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
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["userChatInfo"] });
            queryClient.invalidateQueries({ queryKey: ["activeChats"] });
            queryClient.invalidateQueries({ queryKey: ["chats"] });
        },
    });
}

export function useGetUserChatInfo() {
    return useQuery({
        queryKey: ["userChatInfo"],
        queryFn: async () => {
            const response = await axios.get(`/api/chats/active`);
            return response.data;
        },
        refetchInterval: (data) => {
            return !data?.state?.data?.activeChatId ? 1000 : false;
        },
        staleTime: 1000 * 60 * 5,
    });
}

export function useGetActiveChatId() {
    const { data } = useGetUserChatInfo();
    return data?.activeChatId;
}

export function useGetChatById(chatId) {
    const queryClient = useQueryClient();

    return useQuery({
        queryKey: ["chat", chatId],
        queryFn: async () => {
            if (!chatId) throw new Error("chatId is required");

            // Track this query with a timestamp to identify outdated responses
            const requestTimestamp = Date.now();
            queryClient.setQueryData(
                ["chatRequestTimestamp", chatId],
                requestTimestamp,
            );

            const response = await axios.get(`/api/chats/${String(chatId)}`);

            // Check if this response is still the most recent one
            const currentTimestamp =
                queryClient.getQueryData(["chatRequestTimestamp", chatId]) || 0;
            if (requestTimestamp < currentTimestamp) {
                // Return the current data instead of the outdated response
                return (
                    queryClient.getQueryData(["chat", chatId]) || response.data
                );
            }

            return response.data;
        },
        enabled: !!chatId,
        // Reduce stale time to ensure more frequent refreshes
        staleTime: 1000 * 60, // 1 minute
        // Add refetchOnMount to ensure fresh data when switching chats
        refetchOnMount: true,
    });
}

export function useGetActiveChat() {
    const activeChatId = useGetActiveChatId();
    return useGetChatById(activeChatId);
}

function shouldUpdateActiveChatId(previousData, activeChatId) {
    if (!previousData) return true;
    const recentChatIds = previousData.recentChatIds || [];
    return (
        activeChatId !== previousData.activeChatId ||
        recentChatIds.indexOf(activeChatId) >= 3
    );
}

export function useSetActiveChatIdApply() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (activeChatId) => {
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
        onMutate: async (activeChatId) => {
            if (!isValidObjectId(activeChatId)) return;
            const previousData = queryClient.getQueryData(["userChatInfo"]);
            let recentChatIds = previousData?.recentChatIds || [];

            const index = recentChatIds.indexOf(activeChatId);
            if (index === -1 || index >= 3) {
                if (index !== -1) {
                    recentChatIds.splice(index, 1);
                }
                recentChatIds.unshift(activeChatId);
            }

            const expectedData = { activeChatId, recentChatIds };
            const possibleChat =
                queryClient.getQueryData(["chat", activeChatId]) ||
                temporaryNewChat({});

            await queryClient.cancelQueries({ queryKey: ["userChatInfo"] });
            await queryClient.cancelQueries({ queryKey: ["activeChats"] });
            await queryClient.cancelQueries({ queryKey: ["chats"] });
            queryClient.setQueryData(["userChatInfo"], expectedData);
            queryClient.setQueryData(["activeChats"], (oldChats = []) =>
                oldChats.map((chat) =>
                    chat._id === activeChatId ? possibleChat : chat,
                ),
            );
            return { previousData };
        },
        onError: (err, variables, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(
                    ["userChatInfo"],
                    context.previousData,
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

export function useSetActiveChatId() {
    const queryClient = useQueryClient();
    const setActiveChatIdApply = useSetActiveChatIdApply();

    return useMutation({
        mutationFn: async (activeChatId) => {
            const previousData = queryClient.getQueryData(["userChatInfo"]);
            if (shouldUpdateActiveChatId(previousData, activeChatId)) {
                return setActiveChatIdApply.mutateAsync(activeChatId);
            }
            return previousData;
        },
    });
}

export function useUpdateChat() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ chatId, ...updateData }) => {
            if (!chatId) {
                throw new Error("chatId is required");
            }

            // Track this mutation with a timestamp
            const requestTimestamp = Date.now();
            queryClient.setQueryData(
                ["chatRequestTimestamp", chatId],
                requestTimestamp,
            );

            const response = await axios.put(
                `/api/chats/${String(chatId)}`,
                updateData,
            );

            return { data: response.data, timestamp: requestTimestamp };
        },
        onMutate: async ({ chatId, ...updateData }) => {
            await queryClient.cancelQueries({ queryKey: ["chat", chatId] });
            await queryClient.cancelQueries({ queryKey: ["chats"] });
            await queryClient.cancelQueries({ queryKey: ["activeChats"] });

            // Track this mutation with a timestamp
            const requestTimestamp = Date.now();
            queryClient.setQueryData(
                ["chatRequestTimestamp", chatId],
                requestTimestamp,
            );

            const previousChat = queryClient.getQueryData(["chat", chatId]);
            const expectedChatData = { ...previousChat, ...updateData };

            queryClient.setQueryData(["chat", chatId], expectedChatData);

            queryClient.setQueryData(["chats"], (old) => {
                if (!old || !old.pages) return old;
                return {
                    ...old,
                    pages: old.pages.map((page) =>
                        page.map((chat) =>
                            chat._id === chatId ? expectedChatData : chat,
                        ),
                    ),
                };
            });

            queryClient.setQueryData(
                ["activeChats"],
                (old) =>
                    old?.map((chat) =>
                        chat._id === chatId ? expectedChatData : chat,
                    ) || [],
            );

            return { previousChat, timestamp: requestTimestamp };
        },
        onError: (err, variables, context) => {
            if (context?.previousChat) {
                queryClient.setQueryData(
                    ["chat", variables.chatId],
                    context.previousChat,
                );
            }
        },
        onSuccess: (result, { chatId }) => {
            const { data: updatedChat, timestamp } = result;

            // Check if this response is still the most recent one
            const currentTimestamp =
                queryClient.getQueryData(["chatRequestTimestamp", chatId]) || 0;
            if (timestamp < currentTimestamp) {
                console.log(
                    "[useUpdateChat:onSuccess] Ignoring outdated response for",
                    chatId,
                );
                return;
            }

            queryClient.setQueryData(["chat", chatId], updatedChat);
            queryClient.invalidateQueries({ queryKey: ["chats"] });
            queryClient.invalidateQueries({ queryKey: ["activeChats"] });
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
