import {
    useQuery,
    useMutation,
    useQueryClient,
    useInfiniteQuery,
} from "@tanstack/react-query";
import axios from "../utils/axios-client";
import { useContext } from "react";
import { AuthContext } from "../../src/App";

export function useNotifications(showDismissed = false) {
    const queryClient = useQueryClient();
    const previousData = queryClient.getQueryData([
        "notifications",
        showDismissed,
    ]);
    const { refetchUserState } = useContext(AuthContext);

    const invalidateNotifications = () => {
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
    };

    const query = useQuery({
        queryKey: ["notifications", showDismissed],
        queryFn: async () => {
            const { data } = await axios.get(
                `/api/request-progress?showDismissed=${showDismissed}`,
            );

            // Check if any notification has newly completed
            if (previousData?.requests) {
                const newlyCompleted = data.requests.some(
                    (notification) =>
                        notification.status === "completed" &&
                        previousData.requests.find(
                            (prev) =>
                                prev.requestId === notification.requestId &&
                                prev.status !== "completed",
                        ),
                );

                if (newlyCompleted) {
                    // Refetch user state when a notification completes
                    refetchUserState();
                }
            }

            return data;
        },
        refetchInterval: (query) => {
            const requests = query.state.data?.requests;
            if (
                requests?.some(
                    (notification) => notification.status === "in_progress",
                )
            ) {
                return 5000;
            } else {
                return false;
            }
        },
        refetchIntervalInBackground: true,
    });

    return { ...query, invalidateNotifications };
}

export function useDeleteNotification() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (requestId) => {
            const response = await axios.delete("/api/request-progress", {
                data: { requestId },
            });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
        },
    });
}

export function useDismissNotification() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (requestId) => {
            const response = await axios.patch("/api/request-progress", {
                requestId,
            });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
        },
    });
}

export function useCancelRequest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (requestId) => {
            const response = await axios.post("/api/cancel-request", {
                requestId,
            });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
        },
    });
}

export function useInfiniteNotifications() {
    return useInfiniteQuery({
        queryKey: ["notifications", "infinite", true],
        queryFn: async ({ pageParam = 1 }) => {
            const response = await fetch(
                `/api/request-progress?showDismissed=true&page=${pageParam}&limit=10`,
            );
            return response.json();
        },
        getNextPageParam: (lastPage, pages) => {
            return lastPage.hasMore ? pages.length + 1 : undefined;
        },
    });
}
