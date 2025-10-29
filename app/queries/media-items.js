import {
    useMutation,
    useQuery,
    useQueryClient,
    useInfiniteQuery,
} from "@tanstack/react-query";
import axios from "../utils/axios-client";

const DEFAULT_PAGE_SIZE = 50;

export function useMediaItems(page = 1, limit = 50, search = "") {
    const query = useQuery({
        queryKey: ["mediaItems", page, limit, search],
        queryFn: async () => {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: limit.toString(),
            });

            // Add search parameter if provided
            if (search && search.trim()) {
                params.append("search", search.trim());
            }

            const { data } = await axios.get(`/api/media-items?${params}`);
            return data;
        },
        staleTime: 5000, // 5 seconds - shorter for more responsive updates
        refetchInterval: 10000, // Poll every 10 seconds to catch background task updates
    });

    return query;
}

// Infinite scroll version for media items
export function useInfiniteMediaItems(search = "") {
    return useInfiniteQuery({
        queryKey: ["mediaItems", "infinite", search],
        queryFn: async ({ pageParam = 1 }) => {
            const params = new URLSearchParams({
                page: pageParam.toString(),
                limit: DEFAULT_PAGE_SIZE.toString(),
            });

            // Add search parameter if provided
            if (search && search.trim()) {
                params.append("search", search.trim());
            }

            const { data } = await axios.get(`/api/media-items?${params}`);
            return data;
        },
        getNextPageParam: (lastPage, allPages) => {
            const { pagination } = lastPage || {};
            // If there's no next page available, return undefined
            if (!pagination || !pagination.hasNext) {
                return undefined;
            }
            // Otherwise, return the next page number
            return allPages.length + 1;
        },
        staleTime: 5000, // 5 seconds - shorter for more responsive updates
        refetchInterval: 10000, // Poll every 10 seconds to catch background task updates
        initialPageParam: 1,
    });
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

export function useUpdateMediaItemTags() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ taskId, tags }) => {
            const response = await axios.put(
                `/api/media-items/${taskId}/tags`,
                { tags },
            );
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["mediaItems"] });
        },
    });

    return mutation;
}

export function useMigrateMediaItems() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (mediaItems) => {
            const response = await fetch("/api/media-items/migrate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ mediaItems }),
            });

            if (!response.ok) {
                throw new Error("Failed to migrate media items");
            }

            return response.json();
        },
        onSuccess: () => {
            // Invalidate and refetch media items after migration
            queryClient.invalidateQueries({ queryKey: ["mediaItems"] });
        },
    });
}
