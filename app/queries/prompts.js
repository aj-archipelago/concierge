import {
    useQuery,
    useQueries,
    useQueryClient,
    useMutation,
} from "@tanstack/react-query";
import axios from "axios";

export function usePromptsByIds(ids) {
    const queries = useQueries({
        queries: ids.map((id) => ({
            queryKey: ["prompts", id],
            queryFn: async () => {
                const { data } = await axios.get(`/api/prompts/${id}`);
                return data;
            },
            staleTime: Infinity,
        })),
    });

    return {
        data: queries.map((q) => q.data),
        isLoading: queries.some((q) => q.isLoading),
    };
}

export function usePrompt(id) {
    const query = useQuery({
        queryKey: ["prompts", id],
        queryFn: async () => {
            const response = await axios.get(`/api/prompts/${id}`);
            return response.data;
        },
        staleTime: 1000 * 60 * 5,
        enabled: !!id,
    });

    return query;
}

export function useUpdatePrompt() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }) => {
            const response = await axios.put(`/api/prompts/${id}`, data);
            queryClient.invalidateQueries(["prompts", id]);
            return response.data;
        },
    });
}

export function useCreatePrompt() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ workspaceId, prompt }) => {
            const response = await axios.post(
                `/api/workspaces/${workspaceId}/prompts`,
                prompt,
            );
            queryClient.invalidateQueries(["workspaces", workspaceId]);
            return response.data;
        },
    });
}

export function useDeletePrompt() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, workspaceId }) => {
            const response = await axios.delete(
                `/api/workspaces/${workspaceId}/prompts/${id}`,
            );
            queryClient.invalidateQueries(["prompts", id]);
            queryClient.setQueryData(["workspaces", workspaceId], (oldData) => {
                return {
                    ...oldData,
                    prompts: oldData?.prompts.filter((prompt) => prompt !== id),
                };
            });
            return response.data;
        },
    });
}
