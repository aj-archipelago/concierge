import {
    useQuery,
    useMutation,
    useQueryClient,
    useInfiniteQuery,
} from "@tanstack/react-query";
import axios from "../utils/axios-client";
import { isValidObjectId } from "../../src/utils/helper.js";

export const DEFAULT_PAGE_SIZE = 10;

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
                queryClient.setQueryData(["chat", chat._id], {
                    ...existingChat,
                    ...chat,
                });
            });
            return activeChats;
        },
        staleTime: 1000 * 60 * 5,
        refetchInterval: (data) => {
            return !data?.state?.data || !data.state.data.length ? 1000 : false;
        },
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
            const previousActiveChats =
                queryClient.getQueryData(["activeChats"]) || [];
            const previousUserChatInfo =
                queryClient.getQueryData(["userChatInfo"]) || {};
            const newChat = temporaryNewChat({ messages, title });

            queryClient.setQueryData(
                ["activeChats"],
                [newChat, ...previousActiveChats],
            );
            queryClient.setQueryData(["userChatInfo"], {
                ...previousUserChatInfo,
                activeChatId: newChat._id,
            });

            return { previousActiveChats, previousUserChatInfo };
        },
        onSuccess: (newChat) => {
            queryClient.setQueryData(["chat", newChat._id], newChat);
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
            queryClient.invalidateQueries({ queryKey: ["userChatInfo"] });
            queryClient.invalidateQueries({ queryKey: ["activeChats"] });
            queryClient.invalidateQueries({ queryKey: ["chats"] });
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

export function useUpdateChat() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ chatId, ...updateData }) => {
            if (!chatId) {
                throw new Error("chatId is required");
            }
            const response = await axios.put(
                `/api/chats/${String(chatId)}`,
                updateData,
            );
            return response.data;
        },
        onMutate: async ({ chatId, ...updateData }) => {
            await queryClient.cancelQueries({ queryKey: ["chat", chatId] });
            await queryClient.cancelQueries({ queryKey: ["chats"] });
            await queryClient.cancelQueries({ queryKey: ["activeChats"] });

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

            return { previousChat };
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
