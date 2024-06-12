import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

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
        onMutate: async ({ messages }) => {
            await queryClient.cancelQueries(["chats"]);
            await queryClient.cancelQueries(["activeChatId"]);
            await queryClient.setQueryData(["activeChatId"], null);
        },
        onSuccess: (newChat) => {
            queryClient.invalidateQueries(["chats"]);
            queryClient.setQueryData(["chats"], (oldChats = []) => {
                return [
                    newChat,
                    ...oldChats.filter((chat) => chat._id !== newChat._id),
                ];
            });
            queryClient.invalidateQueries(["activeChatId"]);
            queryClient.setQueryData(["activeChatId"], String(newChat._id));
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
            return response.data.activeChatId;
        },
        staleTime: 1000 * 60 * 5,
    });
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
    const data = useGetActiveChatId();
    const activeChatId = data?.data;
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
            activeChatId &&
                queryClient.setQueryData(["activeChatId"], activeChatId);
        },
        onSuccess: ({ activeChatId }) => {
            queryClient.invalidateQueries(["activeChatId"]);
            queryClient.setQueryData(["activeChatId"], activeChatId);
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
                try {
                    console.log("No active chat ID, creating new chat!");
                    const newChat = await addChatMutation.mutateAsync({
                        messages: [message],
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
                        newChat,
                        ...(oldChats || []),
                    ]);
                } catch (error) {
                    console.error("Error creating new chat:", error);
                    throw new Error("Failed to create new chat");
                }
            } else {
                try {
                    const chatResponse = await axios.post(
                        `/api/chats/${String(chatId)}`,
                        { message },
                    );
                    chatData = chatResponse.data;
                } catch (error) {
                    console.error("Error updating chat:", error);
                    throw new Error("Failed to update chat");
                }
            }

            return chatData;
        },
        onMutate: ({ message, chatId }) => {
            if (!chatId || !message) {
                return;
            }

            // Update the query cache with the expected update
            const existingChat = queryClient.getQueryData([
                "chat",
                String(chatId),
            ]);
            const expectedChatData = {
                ...existingChat,
                messages: [...existingChat.messages, message],
            };
            queryClient.setQueryData(
                ["chat", String(chatId)],
                expectedChatData,
            );
        },
        onSuccess: (updatedChat) => {
            const chatId = String(updatedChat?._id);
            //for case e.g. when user navigates to another chat
            // const activeChatId = String(
            //     queryClient.getQueryData(["activeChatId"]),
            // );
            // if (String(chatId) !== String(activeChatId)) {
            //     console.log(
            //         "Updating active chat ID:",
            //         chatId,
            //         "ex:",
            //         activeChatId,
            //     );
            //     queryClient.invalidateQueries(["activeChatId"]);
            //     queryClient.setQueryData(["activeChatId"], String(chatId));
            // }
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
        onMutate: async ({ chatId, updateData }) => {
            await queryClient.cancelQueries(["chat", chatId]);

            const previousChat = queryClient.getQueryData(["chat", chatId]);

            queryClient.setQueryData(["chat", chatId], (oldChat) => {
                return {
                    ...oldChat,
                    ...updateData,
                };
            });

            return { previousChat };
        },
        onError: (err, variables, context) => {
            console.error("Error updating chat:", err);
            if (context && context.previousChat) {
                queryClient.setQueryData(
                    ["chat", variables.chatId],
                    context.previousChat,
                );
            }
        },
        onSuccess: (updatedChat, { chatId }) => {
            queryClient.invalidateQueries(["chat", chatId]);
            queryClient.setQueryData(["chat", chatId], updatedChat);
        },
    });
}
