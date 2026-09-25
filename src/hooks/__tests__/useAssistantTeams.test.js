import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axios from "../../../app/utils/axios-client";
import { useAssistantTeams } from "../useAssistantTeams";
jest.mock("../../../app/utils/axios-client", () => ({ get: jest.fn() }));
jest.mock("../../App", () => ({
    CurrentUserContext: require("react").createContext({ _id: "user" }),
}));
it("refreshes only the visible team page and lets users return through history", async () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    axios.get.mockImplementation(async (url) => {
        const cursor = new URL(url, "http://local").searchParams.get("cursor");
        return {
            data: {
                teams: [{ teamId: cursor || "first", status: "completed" }],
                nextCursor: String(Number(cursor || 0) + 1),
            },
        };
    });
    const { result, rerender, unmount } = renderHook(
        (props) => useAssistantTeams(props),
        { wrapper, initialProps: { status: "history" } },
    );
    try {
        await waitFor(() => expect(result.current.isFetching).toBe(false));
        for (let i = 1; i <= 5; i++) {
            act(() => result.current.fetchNextPage());
            await waitFor(() =>
                expect(result.current.data?.pages[0].teams[0].teamId).toBe(
                    String(i),
                ),
            );
            await waitFor(() => expect(result.current.isFetching).toBe(false));
        }
        axios.get.mockClear();
        await act(async () => {
            await result.current.refetch();
        });
        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(axios.get.mock.calls[0][0]).toContain("cursor=5");
        expect(result.current.data.pages).toHaveLength(1);
        act(() => result.current.fetchPreviousPage());
        await waitFor(() =>
            expect(result.current.data.pages[0].teams[0].teamId).toBe("4"),
        );
        rerender({ status: "active" });
        await waitFor(() =>
            expect(result.current.data.pages[0].teams[0].teamId).toBe("first"),
        );
        expect(result.current.hasPreviousPage).toBe(false);
    } finally {
        unmount();
        client.clear();
    }
});
