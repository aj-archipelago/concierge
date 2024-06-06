import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import mongoose from "mongoose";

// Default chat object
const defaultChat = { chat: { messages: [], title: "Default Chat" } };
const DEFAULT_CHAT_ID = "default";

// Hook to get all chats
export function useGetChats() {
    return useQuery({
        queryKey: ["chats"],
        queryFn: async () => {
            const response = await axios.get(`/api/chats`);
            return response.data;
        },
        staleTime: 1000 * 60 * 5,
    });
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
        onSuccess: (newChat) => {
            queryClient.invalidateQueries(["chats"]);
            queryClient.setQueryData(["chats"], (old = []) => {
                return [...(Array.isArray(old) ? old : []), newChat];
            });
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

            const previousChats = queryClient.getQueryData(["chats"]);

            queryClient.setQueryData(["chats"], (old) => {
                const oldChats = Array.isArray(old) ? old : [];
                return oldChats.filter((chat) => chat._id !== chatId);
            });

            return { previousChats: previousChats || [] };
        },
        onError: (err, variables, context) => {
            if (context && context.previousChats) {
                queryClient.setQueryData(["chats"], context.previousChats);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(["chats"]);
        },
    });
}

export function useGetActiveChatId() {
    return useQuery({
        queryKey: ["activeChatId"],
        queryFn: async () => {
            const response = await axios.get(`/api/chats/active`);
            return String(response.data.activeChatId || DEFAULT_CHAT_ID);
        },
        staleTime: 1000 * 60 * 5,
    });
}

export function useGetChatById(chatId) {
    return useQuery({
        queryKey: ["chat", chatId],
        queryFn: async () => {
            if (chatId === DEFAULT_CHAT_ID) {
                return defaultChat;
            }
            if (!mongoose.Types.ObjectId.isValid(chatId)) {
                return defaultChat;
            }
            const response = await axios.get(`/api/chats/${String(chatId)}`);
            return response.data;
        },
        enabled: !!chatId,
    });
}

export function useGetActiveChat() {
    const { data: activeChatId } = useGetActiveChatId();
    return useGetChatById(activeChatId);
}

export function useSetActiveChatId() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (activeChatId) => {
            const response = await axios.put(`/api/chats/active`, {
                activeChatId:
                    activeChatId !== null ? String(activeChatId) : null,
            });
            return response.data;
        },
        onSuccess: (updatedActiveChatId) => {
            queryClient.invalidateQueries(["activeChatId"]);
            queryClient.setQueryData(["activeChatId"], updatedActiveChatId);
        },
    });
}

export function useAddMessage() {
    const queryClient = useQueryClient();
    const addChatMutation = useAddChat();
    const { data: activeChatId } = useGetActiveChatId();
    const setActiveChatIdMutation = useSetActiveChatId();

    return useMutation({
        mutationFn: async ({ message }) => {
            let chatData;
            let chatId =
                activeChatId != null
                    ? String(activeChatId)
                    : String(DEFAULT_CHAT_ID);

            // console.log("Active Chat ID:", activeChatId, "chatid", chatId);

            if (!chatId || chatId === DEFAULT_CHAT_ID) {
                try {
                    console.log("Creating new chat with message:", message);
                    const title =
                        (message?.payload || "").substring(0, 14) || "New Chat";
                    const newChat = await addChatMutation.mutateAsync({
                        messages: [message],
                        title,
                    });
                    chatId = String(newChat?._id);
                    chatData = newChat;
                    console.log(
                        "New chat created:",
                        chatData,
                        "Chat ID:",
                        chatId,
                    );

                    // Update the query cache with the newly created chat
                    queryClient.setQueryData(["chats"], (oldChats) => [
                        ...(oldChats || []),
                        newChat,
                    ]);

                    // Set the active chat ID to the new chat ID
                    await setActiveChatIdMutation.mutateAsync(String(chatId));
                } catch (error) {
                    console.error("Error creating new chat:", error);
                    throw new Error("Failed to create new chat");
                }
            } else {
                try {
                    // Update the query cache with the expected update
                    const existingChat = queryClient.getQueryData([
                        "chat",
                        chatId,
                    ]);
                    // console.log("Chat ID:", chatId, "Chat Data:", existingChat);
                    const expectedChatData = {
                        ...existingChat,
                        messages: [...existingChat.messages, message],
                    };
                    queryClient.setQueryData(
                        ["chat", chatId],
                        expectedChatData,
                    );

                    // console.log("Adding message to existing chat:", chatId, message);
                    const chatResponse = await axios.get(
                        `/api/chats/${String(chatId)}`,
                    );
                    chatData = chatResponse.data;
                    if (
                        !chatData.title ||
                        chatData.title === "Default Chat" ||
                        chatData.title === "New Chat"
                    ) {
                        chatData.title =
                            (message?.payload || "").substring(0, 14) ||
                            "New Chat";
                    }
                    chatData.messages.push(message);
                    await axios.put(`/api/chats/${chatId}`, chatData);
                } catch (error) {
                    console.error("Error updating chat:", error);
                    throw new Error("Failed to update chat");
                }
            }

            // console.log("Chat ID:", chatId, "Chat Data:", chatData);

            return chatData;
        },
        onSuccess: (updatedChat, { chatId }) => {
            queryClient.invalidateQueries(["chat", chatId]);
            queryClient.setQueryData(["chat", chatId], updatedChat);
        },
    });
}
