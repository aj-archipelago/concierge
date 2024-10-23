import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "../utils/axios-client";

// useAddDocument hook
export function useAddDocument() {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: async ({ docId, filename, chatId }) => {
            const response = await axios.post(`/api/uploadedDocs`, {
                docId,
                filename,
                chatId,
            });
            return response.data;
        },
        onMutate: async ({ docId, filename, chatId }) => {
            await queryClient.cancelQueries({ queryKey: ["currentUser"] });

            queryClient.setQueryData(["currentUser"], (old) => {
                return {
                    ...old,
                    uploadedDocs: [
                        { docId, filename, chatId },
                        ...old.uploadedDocs,
                    ],
                };
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["currentUser"] });
        },
    });
    return mutation;
}

// useDeleteDocument hook
export function useDeleteDocument() {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: async ({ docId }) => {
            const response = await axios.delete(`/api/uploadedDocs/${docId}`);
            return response.data;
        },
        onMutate: async ({ docId }) => {
            await queryClient.cancelQueries({ queryKey: ["currentUser"] });

            queryClient.setQueryData(["currentUser"], (old) => {
                return {
                    ...old,
                    uploadedDocs: old.uploadedDocs.filter(
                        (doc) => doc.docId !== docId,
                    ),
                };
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["currentUser"] });
        },
    });
    return mutation;
}

// useDeleteAllDocuments hook
export function useDeleteAllDocuments() {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: async () => {
            const response = await axios.delete(`/api/uploadedDocs`);
            return response.data;
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: ["currentUser"] });

            queryClient.setQueryData(["currentUser"], (old) => {
                return {
                    ...old,
                    uploadedDocs: [],
                };
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["currentUser"] });
        },
    });
    return mutation;
}
