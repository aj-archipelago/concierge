import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

// useGetChats hook
export function useGetChats() {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: async () => {
            const response = await axios.get(`/api/chats`);
            return response.data;
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: ["currentUser"] });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(["currentUser"]);
        },
    });
    return mutation;
}

// useAddChat hook
export function useAddChat() {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: async ({ messageList, title }) => {
            console.log("title", title);
            const response = await axios.post(`/api/chats`, {
                messageList,
                title,
            });
            return response.data;
        },
        onMutate: async ({ chat }) => {
            await queryClient.cancelQueries({ queryKey: ["currentUser"] });

            queryClient.setQueryData(["currentUser"], (old) => {
                return {
                    ...old,
                    savedChats: [...(old?.savedChats || []), chat],
                };
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(["currentUser"]);
        },
    });
    return mutation;
}

// useDeleteChat hook
export function useDeleteChat() {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: async ({ chatId }) => {
            const response = await axios.delete(`/api/chats/${chatId}`);
            return response.data;
        },
        onMutate: async ({ chatId }) => {
            await queryClient.cancelQueries({ queryKey: ["currentUser"] });

            queryClient.setQueryData(["currentUser"], (old) => {
                if (!old || !old.chats) {
                    return old;
                }

                return {
                    ...old,
                    chats: old.chats.filter((chat) => chat._id !== chatId),
                };
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(["currentUser"]);
        },
    });
    return mutation;
}
