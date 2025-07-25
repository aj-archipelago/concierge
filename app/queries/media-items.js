import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "../utils/axios-client";

export function useMediaItems(page = 1, limit = 50, filters = {}) {
    const query = useQuery({
        queryKey: ["mediaItems", page, limit, filters],
        queryFn: async () => {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: limit.toString(),
                ...filters,
            });
            const { data } = await axios.get(`/api/media-items?${params}`);
            return data;
        },
        staleTime: 5000, // 5 seconds - shorter for more responsive updates
        refetchInterval: 10000, // Poll every 10 seconds to catch background task updates
    });

    return query;
}

export function useCreateMediaItem() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async (mediaItem) => {
            const response = await axios.post(`/api/media-items`, mediaItem);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["mediaItems"] });
        },
    });

    return mutation;
}

export function useUpdateMediaItem() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ taskId, updates }) => {
            const response = await axios.put(
                `/api/media-items/${taskId}`,
                updates,
            );
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["mediaItems"] });
        },
    });

    return mutation;
}

export function useDeleteMediaItem() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async (taskId) => {
            const response = await axios.delete(`/api/media-items/${taskId}`);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["mediaItems"] });
        },
    });

    return mutation;
}
