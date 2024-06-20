import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { unstable_batchedUpdates } from "react-dom";
import axios from "axios";

// Hook to get all chats
export function useGetChats() {
    const queryClient = useQueryClient();

    return useQuery({
        queryKey: ["chats"],
        queryFn: async () => {
            const response = await axios.get(`/api/chats`);
            const chats = response.data;

            // Update individual chat queries
            chats.forEach((chat) => {
                queryClient.setQueryData(["chat", chat._id], chat);
            });

            return chats;
        },
        staleTime: 1000 * 60 * 5,
    });
}

// Hook to get active chats
export function useGetActiveChats() {
    const queryClient = useQueryClient();

    return useQuery({
        queryKey: ["activeChats"],
        queryFn: async () => {
            const response = await axios.get(`/api/chats/active/detail`);
            const activeChats = response.data;

            // Update individual chat queries
            activeChats.forEach((chat) => {
                queryClient.setQueryData(["chat", chat._id], chat);
            });

            return activeChats;
        },
        staleTime: 1000 * 60 * 5,
    });
}

function temporaryNewChat({ messages, title }) {
    return {
        _id: null, // Temporary ID
        messages: messages || [],
        title: title || "New Chat",
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
        onMutate: async ({ messages, title }) => {
            const previousChats = queryClient.getQueryData(["chats"]) || [];
            const newChat = temporaryNewChat({ messages, title });

            // Check if there's already a temporary chat entry with no ID
            const existingTempChatIndex = previousChats.findIndex(
                (chat) => !chat._id,
            );

            let updatedChats;
            if (existingTempChatIndex !== -1) {
                // Replace the existing temporary chat with the new one
                updatedChats = [...previousChats];
                updatedChats[existingTempChatIndex] = newChat;
            } else {
                // Add the new temporary chat if no existing temporary chat found
                updatedChats = [newChat, ...previousChats];
            }

            queryClient.setQueryData(["chats"], updatedChats);

            // Return a context object with the snapshotted previous state
            return { previousChats };
        },
        onSuccess: (newChat) => {
            queryClient.setQueryData(["chat", newChat._id], newChat);

            // Update the "chats" query while ensuring no duplicates
            queryClient.setQueryData(["chats"], (oldChats) => {
                const filteredChats = oldChats.filter(
                    (chat) => chat._id !== newChat._id && chat._id !== null,
                );
                return [newChat, ...filteredChats];
            });

            unstable_batchedUpdates(() => {
                queryClient.invalidateQueries(["userChatInfo"]);
                queryClient.invalidateQueries(["activeChats"]);
            });
        },
        // Ensure to reset to the previous state in case of an error
        onError: (err, variables, context) => {
            if (context?.previousChats) {
                queryClient.setQueryData(["chats"], context.previousChats);
            }
        },
    });
}

export function useDeleteChat() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ chatId }) => {
            const response = await axios.delete(`/api/chats/${String(chatId)}`);
            return response.data;
        },
        onMutate: async ({ chatId }) => {
            await queryClient.cancelQueries(["chats"]);
            await queryClient.cancelQueries(["activeChats"]);

            const previousChats = queryClient.getQueryData(["chats"]) || [];
            queryClient.setQueryData(["chats"], (oldChats) =>
                oldChats.filter((chat) => chat._id !== chatId),
            );
            queryClient.setQueryData(["activeChats"], (oldChats) =>
                oldChats.filter((chat) => chat._id !== chatId),
            );

            return { previousChats };
        },
        onError: (err, variables, context) => {
            if (context?.previousChats) {
                queryClient.setQueryData(["chats"], context.previousChats);
            }
        },
        onSuccess: () => {
            unstable_batchedUpdates(() => {
                queryClient.invalidateQueries(["chats"]);
                queryClient.invalidateQueries(["userChatInfo"]);
                queryClient.invalidateQueries(["activeChats"]);
            });
        },
    });
}

// Hook to get user chat info (all chat IDs and the most recent active chat ID)
export function useGetUserChatInfo() {
    return useQuery({
        queryKey: ["userChatInfo"],
        queryFn: async () => {
            const response = await axios.get(`/api/chats/active`);
            return response.data;
        },
        staleTime: 1000 * 60 * 5,
    });
}

export function useGetActiveChatId() {
    const { data } = useGetUserChatInfo();
    return data?.activeChatId;
}

export function useGetChatById(chatId) {
    return useQuery({
        queryKey: ["chat", chatId],
        queryFn: async () => {
            if (!chatId) throw new Error("chatId is required");
            const response = await axios.get(`/api/chats/${String(chatId)}`);
            return response.data;
        },
        enabled: !!chatId,
    });
}

export function useGetActiveChat() {
    const activeChatId = useGetActiveChatId();
    return useGetChatById(activeChatId);
}

export function useSetActiveChatId() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (activeChatId) => {
            if (!activeChatId) throw new Error("activeChatId is required");
            const response = await axios.put(`/api/chats/active`, {
                activeChatId,
            });
            return response.data.activeChatId;
        },
        onMutate: async (activeChatId) => {
            const previousData = queryClient.getQueryData(["userChatInfo"]);
            let recentChatIds;

            if (previousData?.recentChatIds.includes(activeChatId)) {
                recentChatIds = previousData.recentChatIds;
            } else {
                recentChatIds = [
                    activeChatId,
                    ...(previousData?.recentChatIds || []),
                ].slice(0, 30); // Ensure max length of 30
            }

            // Keep the top 3 chats in place
            const top3 = previousData?.recentChatIds.slice(0, 3) || [];
            const remainingChats = recentChatIds.filter(
                (id) => !top3.includes(id),
            );

            recentChatIds = [...top3, ...remainingChats.slice(0, 27)];

            const expectedData = {
                activeChatId,
                recentChatIds,
            };
            const possibleChat =
                queryClient.getQueryData(["chat", activeChatId]) ||
                temporaryNewChat({});

            await queryClient.cancelQueries(["userChatInfo"]);
            await queryClient.cancelQueries(["activeChats"]);
            await queryClient.cancelQueries(["chats"]);

            queryClient.setQueryData(["userChatInfo"], expectedData);
            // Do not change order in activeChats
            queryClient.setQueryData(["activeChats"], (oldChats) =>
                oldChats.map((chat) =>
                    chat._id === activeChatId ? possibleChat : chat,
                ),
            );
            // Do not change order in chats
            queryClient.setQueryData(["chats"], (oldChats) =>
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
        onSuccess: () => {
            queryClient.invalidateQueries(["userChatInfo"]);
            queryClient.invalidateQueries(["activeChats"]);
            queryClient.invalidateQueries(["chats"]);
        },
    });
}

export function useAddMessage() {
    const queryClient = useQueryClient();
    const addChatMutation = useAddChat();

    return useMutation({
        mutationFn: async ({ message, chatId }) => {
            let chatData;

            if (!chatId) {
                const newChat = await addChatMutation.mutateAsync({
                    messages: [message],
                });
                chatId = String(newChat?._id);
                chatData = newChat;
                queryClient.setQueryData(["chats"], (old) => [
                    newChat,
                    ...(old || []),
                ]);
                queryClient.setQueryData(["activeChats"], (old) => [
                    newChat,
                    ...(old || []),
                ]);
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
            const chatId = String(updatedChat?._id);
            queryClient.invalidateQueries(["chat", chatId]);
            queryClient.setQueryData(["chat", chatId], updatedChat);
        },
    });
}

// Hook to update a chat by ID
export function useUpdateChat() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (variables) => {
            const { chatId, ...updateData } = variables;
            if (!chatId || !updateData) {
                throw new Error("chatId and updateData are required");
            }
            const response = await axios.put(
                `/api/chats/${String(chatId)}`,
                updateData,
            );
            return response.data;
        },
        onMutate: async (variables) => {
            const { chatId, ...updateData } = variables;
            await queryClient.cancelQueries(["chat", chatId]);

            const previousChat = queryClient.getQueryData(["chat", chatId]);
            const expectedChatData = {
                ...previousChat,
                ...updateData,
            };
            queryClient.setQueryData(["chat", chatId], expectedChatData);

            return { previousChat, expectedChatData };
        },
        onError: (err, variables, context) => {
            if (context?.previousChat) {
                queryClient.setQueryData(
                    ["chat", variables.chatId],
                    context.previousChat,
                );
            }
        },
        onSuccess: (updatedChat, { chatId }) => {
            queryClient.setQueryData(["chat", chatId], updatedChat);
        },
        onSettled: (data, error, variables) => {
            queryClient.invalidateQueries(["chat", variables.chatId]);
        },
    });
}

// Hook to update the active chat by its latest details
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
