import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { isValidObjectId } from "../../src/utils/helper.js";

export function useGetChats() {
    const queryClient = useQueryClient();

    return useQuery({
        queryKey: ["chats"],
        queryFn: async () => {
            const response = await axios.get(`/api/chats`);
            const chats = response.data;
            chats.forEach((chat) => {
                queryClient.setQueryData(["chat", chat._id], chat);
            });
            return chats;
        },
        staleTime: 1000 * 60 * 5,
        refetchInterval: (data) => {
            return !data?.state?.data || !data.state.data.length ? 1000 : false;
        },
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
                queryClient.setQueryData(["chat", chat._id], chat);
            });
            return activeChats;
        },
        staleTime: 1000 * 60 * 5,
    });
}

function temporaryNewChat({ messages, title }) {
    return {
        _id: null,
        messages: messages || [],
        title: title || "",
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
            const previousActiveChats =
                queryClient.getQueryData(["activeChats"]) || [];
            const previousUserChatInfo =
                queryClient.getQueryData(["userChatInfo"]) || {};
            const newChat = temporaryNewChat({ messages, title });

            queryClient.setQueryData(["chats"], [newChat, ...previousChats]);
            queryClient.setQueryData(
                ["activeChats"],
                [newChat, ...previousActiveChats],
            );
            queryClient.setQueryData(["userChatInfo"], {
                ...previousUserChatInfo,
                activeChatId: newChat._id,
            });

            return { previousChats, previousActiveChats, previousUserChatInfo };
        },
        onSuccess: (newChat) => {
            queryClient.setQueryData(["chat", newChat._id], newChat);
            queryClient.setQueryData(["chats"], (oldChats = []) => [
                newChat,
                ...oldChats.filter(
                    (chat) => chat._id !== null && chat._id !== newChat._id,
                ),
            ]);
            queryClient.setQueryData(["activeChats"], (oldChats = []) => [
                newChat,
                ...oldChats.filter(
                    (chat) => chat._id !== null && chat._id !== newChat._id,
                ),
            ]);
            queryClient.setQueryData(["userChatInfo"], (oldInfo) => ({
                ...oldInfo,
                activeChatId: newChat._id,
            }));
            queryClient.invalidateQueries([
                "userChatInfo",
                "activeChats",
                "chats",
            ]);
        },
        onError: (err, variables, context) => {
            if (context?.previousChats) {
                queryClient.setQueryData(["chats"], context.previousChats);
            }
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
            await queryClient.cancelQueries([
                "chats",
                "activeChats",
                "userChatInfo",
            ]);
            const previousChats = queryClient.getQueryData(["chats"]) || [];
            const previousActiveChats =
                queryClient.getQueryData(["activeChats"]) || [];
            const previousUserChatInfo =
                queryClient.getQueryData(["userChatInfo"]) || {};

            const updatedChats = previousChats.filter(
                (chat) => chat._id !== chatId,
            );
            const updatedActiveChats = previousActiveChats.filter(
                (chat) => chat._id !== chatId,
            );

            if (updatedChats.length === 0)
                updatedChats.push(temporaryNewChat({}));
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
                updatedUserChatInfo.activeChatId = updatedChats[0]._id;
            }

            queryClient.setQueryData(["chats"], updatedChats);
            queryClient.setQueryData(["activeChats"], updatedActiveChats);
            queryClient.setQueryData(["userChatInfo"], updatedUserChatInfo);

            return { previousChats, previousActiveChats, previousUserChatInfo };
        },
        onError: (err, variables, context) => {
            if (context?.previousChats) {
                queryClient.setQueryData(["chats"], context.previousChats);
            }
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
            queryClient.invalidateQueries([
                "chats",
                "userChatInfo",
                "activeChats",
            ]);
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
            if (!activeChatId || !isValidObjectId(activeChatId)) {
                throw new Error(
                    "activeChatId is required and must be a valid Mongo ID",
                );
            }
            const response = await axios.put(`/api/chats/active`, {
                activeChatId,
            });
            return response.data.activeChatId;
        },
        onMutate: async (activeChatId) => {
            if (!isValidObjectId(activeChatId)) return;
            const previousData = queryClient.getQueryData(["userChatInfo"]);
            let recentChatIds = previousData?.recentChatIds || [];

            const index = recentChatIds.indexOf(activeChatId);
            if (index > -1) {
                if (index >= 3) {
                    recentChatIds.splice(index, 1);
                    recentChatIds.unshift(activeChatId);
                }
            } else {
                recentChatIds.unshift(activeChatId);
            }

            const expectedData = { activeChatId, recentChatIds };
            const possibleChat =
                queryClient.getQueryData(["chat", activeChatId]) ||
                temporaryNewChat({});

            await queryClient.cancelQueries([
                "userChatInfo",
                "activeChats",
                "chats",
            ]);
            queryClient.setQueryData(["userChatInfo"], expectedData);
            queryClient.setQueryData(["activeChats"], (oldChats = []) =>
                oldChats.map((chat) =>
                    chat._id === activeChatId ? possibleChat : chat,
                ),
            );
            queryClient.setQueryData(["chats"], (oldChats = []) =>
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
            queryClient.invalidateQueries([
                "userChatInfo",
                "activeChats",
                "chats",
            ]);
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
                queryClient.setQueryData(["chats"], (old = []) => [
                    newChat,
                    ...old,
                ]);
                queryClient.setQueryData(["activeChats"], (old = []) => [
                    newChat,
                    ...old,
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

export function useUpdateChat() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ chatId, ...updateData }) => {
            if (!chatId || !updateData) {
                throw new Error("chatId and updateData are required");
            }
            const response = await axios.put(
                `/api/chats/${String(chatId)}`,
                updateData,
            );
            return response.data;
        },
        onMutate: async ({ chatId, ...updateData }) => {
            await queryClient.cancelQueries(["chat", chatId]);
            const previousChat = queryClient.getQueryData(["chat", chatId]);
            const expectedChatData = { ...previousChat, ...updateData };
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
