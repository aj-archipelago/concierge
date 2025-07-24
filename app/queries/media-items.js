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
        staleTime: 30000, // 30 seconds - longer to reduce API calls
        refetchInterval: false, // Disable continuous polling - rely on manual refetch and cache invalidation
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
            // Invalidate all media items queries with pagination
            queryClient.invalidateQueries({
                queryKey: ["mediaItems"],
                exact: false,
            });
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
            // Invalidate all media items queries with pagination
            queryClient.invalidateQueries({
                queryKey: ["mediaItems"],
                exact: false,
            });
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
            // Invalidate all media items queries with pagination
            queryClient.invalidateQueries({
                queryKey: ["mediaItems"],
                exact: false,
            });
        },
    });

    return mutation;
}
