import {
    useQuery,
    useMutation,
    useQueryClient,
    useInfiniteQuery,
} from "@tanstack/react-query";
import axios from "../utils/axios-client";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { AuthContext } from "../../src/App";

const clientSideCompletionHandlers = {
    "subtitle-translate": async ({ refetchUserState }) => {
        refetchUserState();
    },
    transcribe: async ({ refetchUserState }) => {
        refetchUserState();
    },
    "video-translate": async ({ refetchUserState }) => {
        refetchUserState();
    },
    "media-generation": async ({ queryClient }) => {
        queryClient.invalidateQueries({ queryKey: ["mediaItems"] });
    },
    "build-digest": async ({ queryClient }) => {
        queryClient.invalidateQueries({ queryKey: ["currentUserDigest"] });
    },
    "automation-run": async ({ queryClient }) => {
        queryClient.invalidateQueries({ queryKey: ["automations"] });
        queryClient.invalidateQueries({
            queryKey: ["automations", "pinned"],
        });
        queryClient.invalidateQueries({ queryKey: ["currentUserDigest"] });
    },
};

export function runClientSideCompletionHandler(
    task,
    { queryClient, refetchUserState, handledCompletionTaskIdsRef } = {},
) {
    if (!isTaskItem(task) || task.status !== "completed") {
        return false;
    }

    const taskId = getItemId(task);
    const handler = clientSideCompletionHandlers[task.type];
    if (!taskId || !handler) {
        return false;
    }

    const handledIds = handledCompletionTaskIdsRef?.current;
    if (handledIds?.has(taskId)) {
        return false;
    }

    const logHandlerError = (error) => {
        console.error(
            `Error handling completed ${task.type} task ${taskId}:`,
            error,
        );
    };

    handledIds?.add(taskId);
    try {
        Promise.resolve(handler({ task, queryClient, refetchUserState })).catch(
            logHandlerError,
        );
    } catch (error) {
        logHandlerError(error);
    }
    return true;
}

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

const INBOX_NOTIFICATION_POLL_MS = 60_000;
const LIVE_TASK_IDLE_POLL_MS = 30_000;
const LIVE_TASK_ACTIVE_POLL_MS = 5_000;
const ACTIVE_TASK_STATUSES = new Set(["in_progress", "pending"]);
const TERMINAL_TASK_STATUSES = new Set([
    "abandoned",
    "cancelled",
    "completed",
    "failed",
]);
const TASK_ID_SEPARATOR = "\u001f";

function getItemId(item) {
    return item?._id?.toString?.() || item?._id;
}

function isTaskItem(item) {
    return item?.inboxKind === "task";
}

function isActiveTask(item) {
    return isTaskItem(item) && ACTIVE_TASK_STATUSES.has(item.status);
}

function isTerminalTask(item) {
    return isTaskItem(item) && TERMINAL_TASK_STATUSES.has(item.status);
}

export function mergeInboxWithLiveTasks(inboxData, liveData) {
    if (!inboxData) return inboxData;

    const liveTasks = liveData?.tasks || [];
    const liveTaskById = new Map(
        liveTasks.map((task) => [getItemId(task), task]).filter(([id]) => id),
    );
    const seenIds = new Set();
    const requests = (inboxData.requests || []).map((item) => {
        const itemId = getItemId(item);
        if (!itemId || !liveTaskById.has(itemId)) {
            return item;
        }

        seenIds.add(itemId);
        return {
            ...item,
            ...liveTaskById.get(itemId),
        };
    });

    for (const task of liveTasks) {
        const taskId = getItemId(task);
        if (
            taskId &&
            !seenIds.has(taskId) &&
            !task.dismissed &&
            isActiveTask(task)
        ) {
            requests.unshift(task);
        }
    }

    return {
        ...inboxData,
        requests,
        activeTaskCount:
            liveData?.activeTaskCount ?? inboxData.activeTaskCount ?? 0,
    };
}

function listsEqual(a, b) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => value === b[index]);
}

function encodeTaskIds(ids) {
    return ids.join(TASK_ID_SEPARATOR);
}

function decodeTaskIds(encodedIds) {
    return encodedIds ? encodedIds.split(TASK_ID_SEPARATOR) : [];
}

export function addTrackedTaskIds(currentIds, idsToAdd) {
    const next = new Set(currentIds);
    idsToAdd.forEach((id) => {
        if (id) next.add(id);
    });
    return Array.from(next).sort();
}

export function reconcileTrackedTaskIds(
    currentIds,
    { liveTasks = [], inboxActiveTaskIds = [] } = {},
) {
    const liveTaskIds = new Set(liveTasks.map(getItemId).filter(Boolean));
    const inboxActiveTaskIdSet = new Set(inboxActiveTaskIds);
    const terminalTaskIds = new Set(
        liveTasks
            .filter((task) => currentIds.includes(getItemId(task)))
            .filter(isTerminalTask)
            .map(getItemId)
            .filter(Boolean),
    );
    const next = new Set(currentIds);

    liveTasks.filter(isActiveTask).forEach((task) => {
        const id = getItemId(task);
        if (id) next.add(id);
    });
    terminalTaskIds.forEach((id) => {
        if (!inboxActiveTaskIdSet.has(id)) {
            next.delete(id);
        }
    });
    currentIds.forEach((id) => {
        if (!liveTaskIds.has(id) && !inboxActiveTaskIdSet.has(id)) {
            next.delete(id);
        }
    });

    return Array.from(next).sort();
}

export function useInbox(showDismissed = false) {
    const queryClient = useQueryClient();
    const { refetchUserState } = useContext(AuthContext);
    const [trackedTaskIds, setTrackedTaskIds] = useState([]);
    const trackedTaskIdsRef = useRef(trackedTaskIds);
    trackedTaskIdsRef.current = trackedTaskIds;
    const handledTerminalTaskIdsRef = useRef(new Set());
    const handledCompletionTaskIdsRef = useRef(new Set());
    const previousInboxRequestsRef = useRef(null);

    const invalidateInbox = () => {
        queryClient.invalidateQueries({ queryKey: ["inbox"] });
    };

    const query = useQuery({
        queryKey: ["inbox", showDismissed],
        queryFn: async () => {
            const { data } = await axios.get(
                `/api/inbox?showDismissed=${showDismissed}`,
            );
            return data;
        },
        refetchInterval: () => INBOX_NOTIFICATION_POLL_MS,
        refetchIntervalInBackground: true,
    });

    useEffect(() => {
        previousInboxRequestsRef.current = null;
        handledTerminalTaskIdsRef.current.clear();
        handledCompletionTaskIdsRef.current.clear();
    }, [showDismissed]);

    useEffect(() => {
        const requests = query.data?.requests;
        if (!Array.isArray(requests)) return;

        requests.filter(isActiveTask).forEach((task) => {
            const id = getItemId(task);
            if (!id) return;
            handledTerminalTaskIdsRef.current.delete(id);
            handledCompletionTaskIdsRef.current.delete(id);
        });

        const previousRequests = previousInboxRequestsRef.current;
        previousInboxRequestsRef.current = requests;
        if (!previousRequests) return;

        const previousById = new Map(
            previousRequests
                .map((item) => [getItemId(item), item])
                .filter(([id]) => id),
        );

        requests.forEach((item) => {
            if (!isTaskItem(item)) return;
            const id = getItemId(item);
            const previousItem = previousById.get(id);
            if (!id || !previousItem || previousItem.status === item.status) {
                return;
            }

            runClientSideCompletionHandler(item, {
                queryClient,
                refetchUserState,
                handledCompletionTaskIdsRef,
            });

            queryClient.invalidateQueries({
                queryKey: ["tasks", id],
            });
        });
    }, [query.data?.requests, queryClient, refetchUserState]);

    const inboxActiveTaskIds = useMemo(
        () =>
            (query.data?.requests || [])
                .filter(isActiveTask)
                .map(getItemId)
                .filter(Boolean)
                .sort(),
        [query.data?.requests],
    );
    const inboxActiveTaskIdKey = encodeTaskIds(inboxActiveTaskIds);
    const trackedTaskIdKey = encodeTaskIds(trackedTaskIds);

    useEffect(() => {
        if (showDismissed || !inboxActiveTaskIdKey) return;

        const activeTaskIds = decodeTaskIds(inboxActiveTaskIdKey);
        const currentIds = trackedTaskIdsRef.current;
        const nextList = addTrackedTaskIds(currentIds, activeTaskIds);
        if (listsEqual(currentIds, nextList)) {
            return;
        }

        setTrackedTaskIds((currentIds) => {
            const nextList = addTrackedTaskIds(currentIds, activeTaskIds);
            return listsEqual(currentIds, nextList) ? currentIds : nextList;
        });
    }, [showDismissed, inboxActiveTaskIdKey]);

    const liveQuery = useQuery({
        queryKey: ["tasks", "live", trackedTaskIdKey],
        enabled: !showDismissed,
        queryFn: async () => {
            const trackedIds = decodeTaskIds(trackedTaskIdKey);
            const params = trackedIds.length
                ? `?ids=${encodeURIComponent(trackedIds.join(","))}`
                : "";
            const { data } = await axios.get(`/api/tasks/live${params}`);
            return data;
        },
        refetchInterval: (liveQueryResult) => {
            const data = liveQueryResult.state.data;
            const hasActiveTasks =
                (data?.activeTaskCount || 0) > 0 ||
                (data?.tasks || []).some(isActiveTask) ||
                Boolean(trackedTaskIdKey);
            return hasActiveTasks
                ? LIVE_TASK_ACTIVE_POLL_MS
                : LIVE_TASK_IDLE_POLL_MS;
        },
        refetchIntervalInBackground: true,
    });

    useEffect(() => {
        if (showDismissed || !liveQuery.data) return;

        const liveTasks = liveQuery.data.tasks || [];
        liveTasks.filter(isActiveTask).forEach((task) => {
            const id = getItemId(task);
            if (id) {
                handledTerminalTaskIdsRef.current.delete(id);
                handledCompletionTaskIdsRef.current.delete(id);
            }
        });

        const currentTrackedIds = trackedTaskIdsRef.current;
        const trackedSet = new Set(currentTrackedIds);
        const terminalTasks = liveTasks
            .filter((task) => trackedSet.has(getItemId(task)))
            .filter(isTerminalTask);
        const unhandledTerminalTasks = terminalTasks.filter((task) => {
            const id = getItemId(task);
            return id && !handledTerminalTaskIdsRef.current.has(id);
        });

        if (unhandledTerminalTasks.length > 0) {
            queryClient.invalidateQueries({
                queryKey: ["inbox", showDismissed],
                exact: true,
            });
        }

        unhandledTerminalTasks.forEach((task) => {
            const id = getItemId(task);
            handledTerminalTaskIdsRef.current.add(id);

            runClientSideCompletionHandler(task, {
                queryClient,
                refetchUserState,
                handledCompletionTaskIdsRef,
            });

            queryClient.invalidateQueries({
                queryKey: ["tasks", id],
            });
        });

        const activeInboxTaskIds = decodeTaskIds(inboxActiveTaskIdKey);
        const nextTrackedIds = reconcileTrackedTaskIds(currentTrackedIds, {
            liveTasks,
            inboxActiveTaskIds: activeInboxTaskIds,
        });
        if (!listsEqual(currentTrackedIds, nextTrackedIds)) {
            // Use functional updater so we always reconcile against the latest
            // trackedTaskIds without needing it in the dep array (which would
            // create a feedback loop: setState -> dep changes -> effect re-runs).
            setTrackedTaskIds((prev) => {
                const next = reconcileTrackedTaskIds(prev, {
                    liveTasks,
                    inboxActiveTaskIds: activeInboxTaskIds,
                });
                return listsEqual(prev, next) ? prev : next;
            });
        }
    }, [
        inboxActiveTaskIdKey,
        liveQuery.data,
        queryClient,
        refetchUserState,
        showDismissed,
    ]);

    const data = useMemo(
        () => mergeInboxWithLiveTasks(query.data, liveQuery.data),
        [query.data, liveQuery.data],
    );

    return { ...query, data, liveQuery, invalidateInbox };
}

/** @deprecated Use useInbox */
export function useTasks(showDismissed = false) {
    return useInbox(showDismissed);
}

export function useMarkNotificationsRead() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ ids, all } = {}) => {
            const response = await axios.post("/api/inbox/read", { ids, all });
            return response.data;
        },
        onMutate: async ({ ids, all } = {}) => {
            await queryClient.cancelQueries({ queryKey: ["inbox"] });

            queryClient.setQueriesData({ queryKey: ["inbox"] }, (old) => {
                if (!old?.requests) {
                    return old;
                }

                const nextRequests = old.requests.map((item) => {
                    if (item.inboxKind !== "notification") {
                        return item;
                    }
                    if (all || ids?.includes(item._id)) {
                        return { ...item, read: true };
                    }
                    return item;
                });

                let unreadNotificationCount = old.unreadNotificationCount ?? 0;
                if (all) {
                    unreadNotificationCount = 0;
                } else if (ids?.length) {
                    unreadNotificationCount = Math.max(
                        0,
                        unreadNotificationCount - ids.length,
                    );
                }

                return {
                    ...old,
                    requests: nextRequests,
                    unreadNotificationCount,
                };
            });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["inbox"] });
        },
    });
}

export function useDeleteInboxItem() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, inboxKind = "task" }) => {
            const response = await axios.delete("/api/inbox", {
                data: { _id: id, inboxKind },
            });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["inbox"] });
        },
    });
}

/** @deprecated Use useDeleteInboxItem */
export function useDeleteTask() {
    const mutation = useDeleteInboxItem();
    return {
        ...mutation,
        mutate: (id) => mutation.mutate({ id, inboxKind: "task" }),
        mutateAsync: (id) => mutation.mutateAsync({ id, inboxKind: "task" }),
    };
}

export function useDismissInboxItem() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, inboxKind = "task" }) => {
            const response = await axios.patch("/api/inbox", {
                _id: id,
                inboxKind,
            });
            return response.data;
        },
        onSuccess: (_data, variables) => {
            const dismissedTaskId =
                variables?.inboxKind !== "notification"
                    ? variables?.id?.toString?.() || variables?.id
                    : null;

            if (dismissedTaskId) {
                queryClient.setQueriesData(
                    { queryKey: ["tasks", "live"] },
                    (old) => {
                        if (!old?.tasks) return old;

                        const nextTasks = old.tasks.filter(
                            (task) => getItemId(task) !== dismissedTaskId,
                        );
                        if (nextTasks.length === old.tasks.length) {
                            return old;
                        }

                        return {
                            ...old,
                            tasks: nextTasks,
                        };
                    },
                );
                queryClient.invalidateQueries({ queryKey: ["tasks", "live"] });
            }
            queryClient.invalidateQueries({ queryKey: ["inbox"] });
        },
    });
}

/** @deprecated Use useDismissInboxItem */
export function useDismissTask() {
    const mutation = useDismissInboxItem();
    return {
        ...mutation,
        mutate: (id) => mutation.mutate({ id, inboxKind: "task" }),
        mutateAsync: (id) => mutation.mutateAsync({ id, inboxKind: "task" }),
    };
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
            queryClient.invalidateQueries({ queryKey: ["inbox"] });
        },
    });
}

export function useInfiniteInbox() {
    return useInfiniteQuery({
        queryKey: ["inbox", "infinite", true],
        queryFn: async ({ pageParam = 1 }) => {
            const response = await fetch(
                `/api/inbox?showDismissed=true&page=${pageParam}&limit=10`,
            );
            return response.json();
        },
        getNextPageParam: (lastPage, pages) => {
            return lastPage.hasMore ? pages.length + 1 : undefined;
        },
    });
}

/** @deprecated Use useInfiniteInbox */
export function useInfiniteTasks() {
    return useInfiniteInbox();
}

export function useRunTask() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (taskData) => {
            const response = await axios.post("/api/tasks", taskData);
            return response.data;
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["inbox"] });
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

            queryClient.invalidateQueries({ queryKey: ["inbox"] });
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
            queryClient.invalidateQueries({ queryKey: ["inbox"] });
        },
    });
}
