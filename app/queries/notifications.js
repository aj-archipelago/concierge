import {
    useQuery,
    useMutation,
    useQueryClient,
    useInfiniteQuery,
} from "@tanstack/react-query";
import axios from "../utils/axios-client";
import { useContext } from "react";
import { AuthContext } from "../../src/App";

const clientSideCompletionHandlers = {
    coding: async ({ task, queryClient }) => {
        const { chatId } = task.metadata;
        queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
    },
    "subtitle-translate": async ({ refetchUserState }) => {
        refetchUserState();
    },
    transcribe: async ({ refetchUserState }) => {
        refetchUserState();
    },
    "video-translate": async ({ refetchUserState }) => {
        refetchUserState();
    },
    "build-digest": async ({ queryClient }) => {
        queryClient.invalidateQueries({ queryKey: ["currentUserDigest"] });
    },
};

export function useTask(id) {
    return useQuery({
        queryKey: ["tasks", id],
        queryFn: async () => {
            const { data } = await axios.get(`/api/tasks/${id}`);
            return data;
        },
        enabled: !!id,
        refetchInterval: (query) => {
            if (
                query.state.data?.status === "in_progress" ||
                query.state.data?.status === "pending"
            ) {
                return 5000;
            }
            return false;
        },
        refetchIntervalInBackground: true,
    });
}

export function useTasks(showDismissed = false) {
    const queryClient = useQueryClient();
    const previousData = queryClient.getQueryData(["tasks", showDismissed]);
    const { refetchUserState } = useContext(AuthContext);

    const invalidateTasks = () => {
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
    };

    const query = useQuery({
        queryKey: ["tasks", showDismissed],
        queryFn: async () => {
            const { data } = await axios.get(
                `/api/tasks?showDismissed=${showDismissed}`,
            );

            // Check if any task has newly completed or has had its status updated
            if (previousData?.requests) {
                data.requests.forEach((task) => {
                    const prevTask = previousData.requests.find(
                        (prev) => prev._id === task._id,
                    );

                    if (prevTask && prevTask.status !== task.status) {
                        if (
                            task.status === "completed" &&
                            prevTask.status !== "completed"
                        ) {
                            // Handle newly completed task
                            if (clientSideCompletionHandlers[task.type]) {
                                clientSideCompletionHandlers[task.type]({
                                    task,
                                    queryClient,
                                    refetchUserState,
                                });
                            }
                        }

                        queryClient.invalidateQueries({
                            queryKey: ["tasks", task._id],
                        });
                    }
                });
            }

            return data;
        },
        refetchInterval: (query) => {
            const requests = query.state.data?.requests;
            if (
                requests?.some(
                    (task) =>
                        task.status === "in_progress" ||
                        task.status === "pending",
                )
            ) {
                return 5000;
            } else {
                return false;
            }
        },
        refetchIntervalInBackground: true,
    });

    return { ...query, invalidateTasks };
}

export function useDeleteTask() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (_id) => {
            const response = await axios.delete("/api/tasks", {
                data: { _id },
            });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
        },
    });
}

export function useDismissTask() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (_id) => {
            const response = await axios.patch("/api/tasks", {
                _id: _id,
            });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
        },
    });
}

export function useCancelTask() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (_id) => {
            const response = await axios.post("/api/cancel-request", {
                _id: _id,
            });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
        },
    });
}

export function useInfiniteTasks() {
    return useInfiniteQuery({
        queryKey: ["tasks", "infinite", true],
        queryFn: async ({ pageParam = 1 }) => {
            const response = await fetch(
                `/api/tasks?showDismissed=true&page=${pageParam}&limit=10`,
            );
            return response.json();
        },
        getNextPageParam: (lastPage, pages) => {
            return lastPage.hasMore ? pages.length + 1 : undefined;
        },
    });
}

export function useRunTask() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (taskData) => {
            const response = await axios.post("/api/tasks", taskData);
            return response.data;
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
            if (variables.chatId) {
                queryClient.invalidateQueries({
                    queryKey: ["chat", variables.chatId],
                });
            }
        },
    });
}

export function useRetryTask() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (taskId) => {
            const response = await axios.post(`/api/tasks/${taskId}/retry`);
            return response.data;
        },
        onSuccess: (data) => {
            if (data.invokedFrom.source === "chat") {
                queryClient.invalidateQueries({
                    queryKey: ["chat", data.invokedFrom.chatId],
                });
            }

            queryClient.invalidateQueries({ queryKey: ["tasks"] });
        },
    });
}

export function useDeleteOldTasks() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (days = 7) => {
            const response = await axios.post("/api/tasks/delete-old", {
                days,
            });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
        },
    });
}
