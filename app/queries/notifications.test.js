/**
 * @jest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { AuthContext } from "../../src/App";
import {
    addTrackedTaskIds,
    getLiveTaskRefetchInterval,
    mergeInboxWithLiveTasks,
    reconcileTrackedTaskIds,
    runClientSideCompletionHandler,
    shouldClearHandledTaskGuards,
    useInbox,
} from "./notifications";
import axios from "../utils/axios-client";

jest.mock("../utils/axios-client", () => ({
    __esModule: true,
    default: {
        get: jest.fn(),
        post: jest.fn(),
        patch: jest.fn(),
        delete: jest.fn(),
    },
}));

jest.mock("../../src/App", () => {
    const React = require("react");
    return {
        AuthContext: React.createContext({ refetchUserState: jest.fn() }),
    };
});

describe("mergeInboxWithLiveTasks", () => {
    it("does not reinsert dismissed live tasks that are absent from the inbox", () => {
        const inboxData = {
            requests: [
                {
                    _id: "visible-task",
                    inboxKind: "task",
                    status: "in_progress",
                },
            ],
            activeTaskCount: 1,
        };
        const liveData = {
            activeTaskCount: 2,
            tasks: [
                {
                    _id: "dismissed-task",
                    inboxKind: "task",
                    status: "in_progress",
                    dismissed: true,
                },
                {
                    _id: "visible-task",
                    inboxKind: "task",
                    status: "in_progress",
                    progress: 0.5,
                },
            ],
        };

        expect(mergeInboxWithLiveTasks(inboxData, liveData)).toEqual({
            requests: [
                {
                    _id: "visible-task",
                    inboxKind: "task",
                    status: "in_progress",
                    progress: 0.5,
                },
            ],
            activeTaskCount: 2,
        });
    });
});

describe("tracked task id helpers", () => {
    it("returns the same tracked list when inbox ids are already tracked", () => {
        const current = ["task-1", "task-2"];

        expect(addTrackedTaskIds(current, ["task-2", "task-1"])).toEqual(
            current,
        );
    });

    it("adds active live tasks, removes terminal tasks, and keeps stable ids sorted", () => {
        expect(
            reconcileTrackedTaskIds(["active-old", "done", "missing"], {
                inboxActiveTaskIds: ["active-old"],
                liveTasks: [
                    {
                        _id: "active-new",
                        inboxKind: "task",
                        status: "in_progress",
                    },
                    {
                        _id: "done",
                        inboxKind: "task",
                        status: "completed",
                    },
                    {
                        _id: "untracked-complete",
                        inboxKind: "task",
                        status: "completed",
                    },
                ],
            }),
        ).toEqual(["active-new", "active-old"]);
    });

    it("keeps terminal live tasks tracked until the inbox active cache catches up", () => {
        const terminalLiveTasks = [
            {
                _id: "done",
                inboxKind: "task",
                status: "completed",
            },
        ];

        expect(
            reconcileTrackedTaskIds(["done"], {
                inboxActiveTaskIds: ["done"],
                liveTasks: terminalLiveTasks,
            }),
        ).toEqual(["done"]);

        expect(
            reconcileTrackedTaskIds(["done"], {
                inboxActiveTaskIds: [],
                liveTasks: terminalLiveTasks,
            }),
        ).toEqual([]);
    });
});

describe("live task polling / handled-guard helpers", () => {
    it("polls quickly only while live tasks are actually active", () => {
        expect(
            getLiveTaskRefetchInterval(
                {
                    state: {
                        data: {
                            activeTaskCount: 1,
                            tasks: [
                                {
                                    _id: "task-1",
                                    inboxKind: "task",
                                    status: "in_progress",
                                },
                            ],
                        },
                    },
                },
                "task-1",
            ),
        ).toBe(5_000);

        expect(
            getLiveTaskRefetchInterval(
                {
                    state: {
                        data: {
                            activeTaskCount: 0,
                            tasks: [
                                {
                                    _id: "task-1",
                                    inboxKind: "task",
                                    status: "completed",
                                },
                            ],
                        },
                    },
                },
                "task-1",
            ),
        ).toBe(30_000);

        expect(
            getLiveTaskRefetchInterval(
                {
                    state: {
                        data: { activeTaskCount: 0, tasks: [] },
                    },
                },
                "",
            ),
        ).toBe(false);
    });

    it("does not clear handled guards while a stale inbox row stays in_progress", () => {
        expect(
            shouldClearHandledTaskGuards("in_progress", {
                _id: "task-1",
                inboxKind: "task",
                status: "in_progress",
            }),
        ).toBe(false);

        expect(
            shouldClearHandledTaskGuards("completed", {
                _id: "task-1",
                inboxKind: "task",
                status: "pending",
            }),
        ).toBe(true);

        expect(
            shouldClearHandledTaskGuards(undefined, {
                _id: "task-1",
                inboxKind: "task",
                status: "in_progress",
            }),
        ).toBe(true);
    });
});

describe("runClientSideCompletionHandler", () => {
    it("refreshes digest once for completed automation runs", () => {
        const queryClient = { invalidateQueries: jest.fn() };
        const handledCompletionTaskIdsRef = { current: new Set() };
        const task = {
            _id: "automation-task-1",
            inboxKind: "task",
            status: "completed",
            type: "automation-run",
        };

        expect(
            runClientSideCompletionHandler(task, {
                queryClient,
                handledCompletionTaskIdsRef,
            }),
        ).toBe(true);
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ["currentUserDigest"],
        });
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ["automations"],
            exact: true,
        });

        expect(
            runClientSideCompletionHandler(task, {
                queryClient,
                handledCompletionTaskIdsRef,
            }),
        ).toBe(false);
        expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2);
    });

    it("refreshes media items, not user state, for completed media generation tasks", () => {
        const queryClient = { invalidateQueries: jest.fn() };
        const refetchUserState = jest.fn();
        const handledCompletionTaskIdsRef = { current: new Set() };
        const task = {
            _id: "media-task-1",
            inboxKind: "task",
            status: "completed",
            type: "media-generation",
        };

        expect(
            runClientSideCompletionHandler(task, {
                queryClient,
                refetchUserState,
                handledCompletionTaskIdsRef,
            }),
        ).toBe(true);
        expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ["mediaItems"],
        });
        expect(refetchUserState).not.toHaveBeenCalled();

        expect(
            runClientSideCompletionHandler(task, {
                queryClient,
                refetchUserState,
                handledCompletionTaskIdsRef,
            }),
        ).toBe(false);
        expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(1);
    });

    it("keeps persisted user-state refresh for completed transcript tasks", () => {
        const queryClient = { invalidateQueries: jest.fn() };
        const refetchUserState = jest.fn();

        expect(
            runClientSideCompletionHandler(
                {
                    _id: "transcribe-task-1",
                    inboxKind: "task",
                    status: "completed",
                    type: "transcribe",
                },
                {
                    queryClient,
                    refetchUserState,
                    handledCompletionTaskIdsRef: { current: new Set() },
                },
            ),
        ).toBe(true);

        expect(refetchUserState).toHaveBeenCalledTimes(1);
        expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    });
});

describe("useInbox completion handling", () => {
    function createWrapper({ queryClient, refetchUserState }) {
        return function Wrapper({ children }) {
            return (
                <QueryClientProvider client={queryClient}>
                    <AuthContext.Provider value={{ refetchUserState }}>
                        {children}
                    </AuthContext.Provider>
                </QueryClientProvider>
            );
        };
    }

    function createQueryClient() {
        return new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                },
            },
        });
    }

    beforeEach(() => {
        axios.get.mockClear();
        axios.get.mockImplementation((url) => {
            if (url.startsWith("/api/tasks/live")) {
                return Promise.resolve({
                    data: { activeTaskCount: 0, tasks: [] },
                });
            }

            return Promise.resolve({
                data: {
                    activeTaskCount: 1,
                    requests: [
                        {
                            _id: "transcribe-task-1",
                            inboxKind: "task",
                            status: "in_progress",
                            type: "transcribe",
                        },
                    ],
                },
            });
        });
    });

    it.each(["completed", "failed", "cancelled", "abandoned"])(
        "does not resurrect a %s task from an older untracked live snapshot",
        async (status) => {
            jest.useFakeTimers();
            const queryClient = createQueryClient();
            const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");
            const wrapper = createWrapper({
                queryClient,
                refetchUserState: jest.fn(),
            });
            const active = {
                _id: "finishing-task",
                inboxKind: "task",
                type: "automation-run",
                status: "in_progress",
            };
            const completed = { ...active, status };
            let untrackedRequests = 0;
            let inboxRequests = 0;
            axios.get.mockImplementation((url) => {
                if (url === "/api/tasks/live") {
                    untrackedRequests += 1;
                    // A slower next response leaves the previous running snapshot
                    // cached while tracking the task already observed completion.
                    if (untrackedRequests > 1) return new Promise(() => {});
                    return Promise.resolve({
                        data: { tasks: [active], activeTaskCount: 1 },
                    });
                }
                if (url.startsWith("/api/tasks/live?")) {
                    return Promise.resolve({
                        data: { tasks: [completed], activeTaskCount: 0 },
                    });
                }
                inboxRequests += 1;
                return Promise.resolve({
                    data: {
                        requests: [inboxRequests === 1 ? active : completed],
                        activeTaskCount: inboxRequests === 1 ? 1 : 0,
                        unreadNotificationCount: 0,
                    },
                });
            });
            const observedCounts = [];
            const { result, unmount } = renderHook(
                () => {
                    const inbox = useInbox();
                    if (inbox.data)
                        observedCounts.push(inbox.data.activeTaskCount);
                    if (observedCounts.length > 100) {
                        throw new Error("Live task updates did not settle");
                    }
                    return inbox;
                },
                { wrapper },
            );

            try {
                // Bounded fake time also exposes loops without hanging the runner.
                for (let tick = 0; tick < 20; tick += 1) {
                    await act(async () => {
                        await jest.advanceTimersByTimeAsync(5);
                    });
                }
                expect(observedCounts).toContain(1);
                expect(observedCounts).toContain(0);
                expect(
                    observedCounts.slice(observedCounts.indexOf(0)),
                ).not.toContain(1);
                expect(result.current.data.requests[0].status).toBe(status);
                expect(
                    invalidateSpy.mock.calls.filter(
                        ([options]) =>
                            options.queryKey[0] === "currentUserDigest",
                    ),
                ).toHaveLength(status === "completed" ? 1 : 0);
                expect(inboxRequests).toBeLessThanOrEqual(2);
            } finally {
                unmount();
                queryClient.clear();
                jest.useRealTimers();
            }
        },
    );

    it("resumes polling for a retry after completion and stops again when idle", async () => {
        jest.useFakeTimers();
        const queryClient = createQueryClient();
        const refetchUserState = jest.fn();
        const Wrapper = createWrapper({ queryClient, refetchUserState });
        const task = {
            _id: "retry-task",
            inboxKind: "task",
            type: "transcribe",
            status: "in_progress",
        };
        let status = "in_progress";
        const liveCalls = [];
        axios.get.mockImplementation((url) => {
            const activeTaskCount = ["pending", "in_progress"].includes(status)
                ? 1
                : 0;
            if (url.startsWith("/api/tasks/live")) {
                liveCalls.push(url);
                return Promise.resolve({
                    data: { tasks: [{ ...task, status }], activeTaskCount },
                });
            }
            return Promise.resolve({
                data: {
                    requests: [{ ...task, status }],
                    activeTaskCount,
                    unreadNotificationCount: 2,
                },
            });
        });
        const { result, unmount } = renderHook(() => useInbox(), {
            wrapper: ({ children }) => (
                <StrictMode>
                    <Wrapper>{children}</Wrapper>
                </StrictMode>
            ),
        });
        const advance = async (ms) => {
            await act(async () => {
                await jest.advanceTimersByTimeAsync(ms);
            });
        };
        try {
            await advance(50);
            expect(result.current.data.activeTaskCount).toBe(1);
            status = "completed";
            await advance(5_050);
            expect(result.current.data.activeTaskCount).toBe(0);
            expect(result.current.data.unreadNotificationCount).toBe(2);
            expect(refetchUserState).toHaveBeenCalledTimes(1);
            const callsWhenIdle = liveCalls.length;
            await advance(20_000);
            expect(liveCalls).toHaveLength(callsWhenIdle);

            // Retrying invalidates the inbox; the completed live snapshot must
            // not prevent tracking and polling the same task's new run.
            status = "pending";
            await act(async () => {
                await queryClient.invalidateQueries({ queryKey: ["inbox"] });
            });
            await advance(50);
            await waitFor(() =>
                expect(result.current.data.activeTaskCount).toBe(1),
            );
            expect(result.current.data.requests[0].status).toBe("pending");
            expect(liveCalls.length).toBeGreaterThan(callsWhenIdle);
            status = "completed";
            await advance(5_050);
            expect(refetchUserState).toHaveBeenCalledTimes(2);
            expect(result.current.data.activeTaskCount).toBe(0);
            const callsAfterRetry = liveCalls.length;
            await advance(20_000);
            expect(liveCalls).toHaveLength(callsAfterRetry);
        } finally {
            unmount();
            queryClient.clear();
            jest.useRealTimers();
        }
    });

    it("ignores a delayed running response superseded by a completed status", async () => {
        const queryClient = createQueryClient();
        const refetchUserState = jest.fn();
        const wrapper = createWrapper({ queryClient, refetchUserState });
        const active = {
            _id: "delayed-task",
            inboxKind: "task",
            type: "transcribe",
            status: "in_progress",
        };
        const running = { tasks: [active], activeTaskCount: 1 };
        const completed = { ...active, status: "completed" };
        queryClient.setQueryData(["tasks", "live"], running);
        let finishOldRequest;
        let oldSignal;
        let hasCompleted = false;
        axios.get.mockImplementation((url, options) => {
            if (url === "/api/tasks/live") {
                oldSignal = options.signal;
                return new Promise((resolve) => {
                    finishOldRequest = resolve;
                });
            }
            if (url.startsWith("/api/tasks/live?")) {
                hasCompleted = true;
                return Promise.resolve({
                    data: { tasks: [completed], activeTaskCount: 0 },
                });
            }
            return Promise.resolve({
                data: {
                    requests: [hasCompleted ? completed : active],
                    activeTaskCount: hasCompleted ? 0 : 1,
                },
            });
        });
        const { result, unmount } = renderHook(() => useInbox(), { wrapper });
        try {
            await waitFor(() => {
                expect(refetchUserState).toHaveBeenCalledTimes(1);
            });
            expect(result.current.data.activeTaskCount).toBe(0);
            expect(oldSignal.aborted).toBe(true);
            await act(async () => {
                finishOldRequest({ data: running });
            });
            expect(
                queryClient.getQueryData(["tasks", "live"]).activeTaskCount,
            ).toBe(0);
            expect(result.current.data.requests[0].status).toBe("completed");
            expect(refetchUserState).toHaveBeenCalledTimes(1);
        } finally {
            unmount();
            queryClient.clear();
        }
    });

    it("handles a retried task completion again only after it becomes active", async () => {
        const queryClient = createQueryClient();
        const refetchUserState = jest.fn();
        const wrapper = createWrapper({ queryClient, refetchUserState });

        const { result } = renderHook(() => useInbox(), { wrapper });

        await waitFor(() => {
            expect(queryClient.getQueryData(["inbox", false])).toEqual(
                expect.objectContaining({
                    requests: [
                        expect.objectContaining({
                            status: "in_progress",
                        }),
                    ],
                }),
            );
        });

        act(() => {
            queryClient.setQueryData(["inbox", false], {
                activeTaskCount: 0,
                requests: [
                    {
                        _id: "transcribe-task-1",
                        inboxKind: "task",
                        status: "completed",
                        type: "transcribe",
                    },
                ],
            });
        });

        await waitFor(() => {
            expect(refetchUserState).toHaveBeenCalledTimes(1);
        });

        act(() => {
            queryClient.setQueryData(["inbox", false], {
                activeTaskCount: 0,
                requests: [
                    {
                        _id: "transcribe-task-1",
                        inboxKind: "task",
                        status: "completed",
                        type: "transcribe",
                    },
                ],
            });
        });

        expect(refetchUserState).toHaveBeenCalledTimes(1);

        act(() => {
            queryClient.setQueryData(["inbox", false], {
                activeTaskCount: 1,
                requests: [
                    {
                        _id: "transcribe-task-1",
                        inboxKind: "task",
                        status: "pending",
                        type: "transcribe",
                    },
                ],
            });
        });
        await waitFor(() => {
            expect(result.current.data?.requests?.[0]?.status).toBe("pending");
        });

        act(() => {
            queryClient.setQueryData(["inbox", false], {
                activeTaskCount: 0,
                requests: [
                    {
                        _id: "transcribe-task-1",
                        inboxKind: "task",
                        status: "completed",
                        type: "transcribe",
                    },
                ],
            });
        });

        await waitFor(() => {
            expect(refetchUserState).toHaveBeenCalledTimes(2);
        });
    });

    it("does not re-invalidate digest/inbox when live is terminal but inbox lags", async () => {
        const queryClient = createQueryClient();
        const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");
        const wrapper = createWrapper({
            queryClient,
            refetchUserState: jest.fn(),
        });

        axios.get.mockImplementation((url) => {
            if (url.startsWith("/api/tasks/live")) {
                return Promise.resolve({
                    data: {
                        activeTaskCount: 1,
                        tasks: [
                            {
                                _id: "automation-task-1",
                                inboxKind: "task",
                                status: "in_progress",
                                type: "automation-run",
                            },
                        ],
                    },
                });
            }

            return Promise.resolve({
                data: {
                    activeTaskCount: 1,
                    requests: [
                        {
                            _id: "automation-task-1",
                            inboxKind: "task",
                            status: "in_progress",
                            type: "automation-run",
                        },
                    ],
                },
            });
        });

        const { result } = renderHook(() => useInbox(), { wrapper });

        await waitFor(() => {
            expect(result.current.data?.requests?.[0]?.status).toBe(
                "in_progress",
            );
        });

        // Wait until the inbox task is included in a live request so terminal
        // handling considers it (trackedSet.has(id)).
        await waitFor(() => {
            expect(axios.get).toHaveBeenCalledWith(
                "/api/tasks/live?ids=automation-task-1",
                expect.any(Object),
            );
        });
        await waitFor(() => {
            expect(queryClient.getQueryData(["tasks", "live"])).toEqual(
                expect.objectContaining({
                    tasks: [
                        expect.objectContaining({
                            status: "in_progress",
                        }),
                    ],
                }),
            );
        });

        const trackedLiveQuery = queryClient
            .getQueryCache()
            .find({ queryKey: ["tasks", "live"] });

        act(() => {
            queryClient.setQueryData(trackedLiveQuery.queryKey, {
                activeTaskCount: 0,
                tasks: [
                    {
                        _id: "automation-task-1",
                        inboxKind: "task",
                        status: "completed",
                        type: "automation-run",
                    },
                ],
            });
        });

        await waitFor(() => {
            expect(invalidateSpy).toHaveBeenCalledWith({
                queryKey: ["currentUserDigest"],
            });
        });

        const digestInvalidationsAfterCompletion =
            invalidateSpy.mock.calls.filter(
                ([options]) => options?.queryKey?.[0] === "currentUserDigest",
            ).length;
        const inboxInvalidationsAfterCompletion =
            invalidateSpy.mock.calls.filter(
                ([options]) => options?.queryKey?.[0] === "inbox",
            ).length;

        // Stale inbox still reporting in_progress must not clear guards and
        // re-fire digest/inbox invalidation on subsequent live snapshots.
        act(() => {
            queryClient.setQueryData(["inbox", false], {
                activeTaskCount: 1,
                requests: [
                    {
                        _id: "automation-task-1",
                        inboxKind: "task",
                        status: "in_progress",
                        type: "automation-run",
                    },
                ],
            });
            queryClient.setQueryData(trackedLiveQuery.queryKey, {
                activeTaskCount: 0,
                tasks: [
                    {
                        _id: "automation-task-1",
                        inboxKind: "task",
                        status: "completed",
                        type: "automation-run",
                        // Heartbeat-style field change with same status.
                        updatedAt: new Date().toISOString(),
                    },
                ],
            });
        });

        await act(async () => {
            await Promise.resolve();
        });

        expect(
            invalidateSpy.mock.calls.filter(
                ([options]) => options?.queryKey?.[0] === "currentUserDigest",
            ),
        ).toHaveLength(digestInvalidationsAfterCompletion);
        expect(
            invalidateSpy.mock.calls.filter(
                ([options]) => options?.queryKey?.[0] === "inbox",
            ),
        ).toHaveLength(inboxInvalidationsAfterCompletion);
    });
});

it("keeps a grouped team card intact and does not reinsert digest or duplicate team activity", () => {
    const grouped = {
        _id: "team",
        inboxKind: "task",
        status: "waiting",
        read: false,
        notificationIds: ["n"],
        team: { teamId: "team", taskStatus: "waiting" },
    };
    const data = mergeInboxWithLiveTasks(
        { requests: [grouped] },
        {
            tasks: [
                {
                    _id: "team",
                    inboxKind: "task",
                    status: "completed",
                    assistantProgress: { teamId: "team" },
                },
                {
                    _id: "digest",
                    inboxKind: "task",
                    type: "build-digest",
                    status: "in_progress",
                },
                {
                    _id: "other-team",
                    inboxKind: "task",
                    status: "in_progress",
                    assistantProgress: { teamId: "other-team" },
                },
            ],
        },
    );
    expect(data.requests).toEqual([grouped]);
});
