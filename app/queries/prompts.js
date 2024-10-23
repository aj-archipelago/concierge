import {
    useQuery,
    useQueries,
    useQueryClient,
    useMutation,
} from "@tanstack/react-query";
import axios from "../utils/axios-client";

export function usePromptsByIds(ids) {
    const queries = useQueries({
        queries: ids.map((id) => ({
            queryKey: ["prompt", id],
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
        queryKey: ["prompt", id],
        queryFn: async () => {
            const response = await axios.get(`/api/prompts/${id}`);
            return response.data;
        },
        staleTime: Infinity,
        enabled: !!id,
    });

    return query;
}

export function useUpdatePrompt() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, workspaceId, data }) => {
            const response = await axios.put(
                `/api/workspaces/${workspaceId}/prompts/${id}`,
                data,
            );
            return response.data;
        },
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: ["prompt", id] });
            const previousPrompt = queryClient.getQueryData(["prompt", id]);
            queryClient.setQueryData(["prompt", id], (old) => {
                return { ...old, ...data };
            });
            return { previousPrompt };
        },
        onSuccess: (data, variables, context) => {
            queryClient.invalidateQueries({
                queryKey: ["prompt", variables.id],
            });
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
            return response.data;
        },
        onSuccess: (data, { workspaceId }) => {
            queryClient.invalidateQueries({
                queryKey: ["workspace", workspaceId],
            });
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
            queryClient.invalidateQueries({ queryKey: ["prompt", id] });
            queryClient.setQueryData(["workspace", workspaceId], (oldData) => {
                return {
                    ...oldData,
                    prompts: oldData?.prompts.filter((prompt) => prompt !== id),
                };
            });
            return response.data;
        },
    });
}

export function usePromptLibrary() {
    return useQuery({
        queryKey: "promptLibrary",
        queryFn: async () => {
            const response = await axios.get("/api/prompts/library");
            return response.data;
        },
        staleTime: Infinity,
    });
}
