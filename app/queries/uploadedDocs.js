//import
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

// useAddDocument hook
export function useAddDocument() {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: async ({ docId, filename }) => {
            const response = await axios.post(`/api/uploadedDocs`, {
                docId,
                filename,
            });
            return response.data;
        },
        onMutate: async ({ docId, filename }) => {
            await queryClient.cancelQueries({ queryKey: ["currentUser"] });

            queryClient.setQueryData(["currentUser"], (old) => {
                return {
                    ...old,
                    uploadedDocs: [{ docId, filename }, ...old.uploadedDocs],
                };
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(["currentUser"]);
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
            queryClient.invalidateQueries(["currentUser"]);
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
            queryClient.invalidateQueries(["currentUser"]);
        },
    });
    return mutation;
}
