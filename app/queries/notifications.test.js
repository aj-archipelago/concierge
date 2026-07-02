/**
 * @jest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { AuthContext } from "../../src/App";
import {
    addTrackedTaskIds,
    mergeInboxWithLiveTasks,
    reconcileTrackedTaskIds,
    runClientSideCompletionHandler,
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

describe("runClientSideCompletionHandler", () => {
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
});
