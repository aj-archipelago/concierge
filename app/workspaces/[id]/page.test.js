import Page from "./page";
import { getCurrentUser } from "../../api/utils/auth";
import { getWorkspace } from "../../api/workspaces/[id]/db";
import { notFound } from "next/navigation";
import { __mockPrefetchQuery as mockPrefetchQuery } from "@tanstack/react-query";

jest.mock("@tanstack/react-query", () => ({
    __esModule: true,
    ...(() => {
        const mockPrefetchQuery = jest.fn(async () => {});

        return {
            __mockPrefetchQuery: mockPrefetchQuery,
            QueryClient: jest.fn(() => ({
                prefetchQuery: mockPrefetchQuery,
            })),
            dehydrate: jest.fn(() => ({ dehydrated: true })),
            HydrationBoundary: ({ children }) => {
                const React = require("react");
                return React.createElement("div", null, children);
            },
        };
    })(),
}));

jest.mock("../../api/utils/auth", () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock("../../api/workspaces/[id]/db", () => ({
    getWorkspace: jest.fn(),
}));

jest.mock("./components/WorkspaceActions", () => ({
    __esModule: true,
    default: () => {
        const React = require("react");
        return React.createElement("div", { "data-testid": "actions" });
    },
}));

jest.mock("./components/WorkspaceTabs", () => ({
    __esModule: true,
    default: () => {
        const React = require("react");
        return React.createElement("div", { "data-testid": "tabs" });
    },
}));

jest.mock("next/navigation", () => ({
    __esModule: true,
    notFound: jest.fn(() => {
        throw new Error("NEXT_NOT_FOUND");
    }),
}));

describe("Workspace page", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentUser.mockResolvedValue({ _id: "user-1" });
    });

    it("throws notFound before prefetching missing or inaccessible workspaces", async () => {
        getWorkspace.mockResolvedValue(undefined);

        await expect(
            Page({ params: Promise.resolve({ id: "missing-workspace" }) }),
        ).rejects.toThrow("NEXT_NOT_FOUND");

        expect(notFound).toHaveBeenCalledTimes(1);
        expect(mockPrefetchQuery).not.toHaveBeenCalled();
    });

    it("prefetches the already-authorized workspace", async () => {
        const workspace = { _id: "workspace-1", name: "Planning" };
        getWorkspace.mockResolvedValue(workspace);

        await Page({ params: Promise.resolve({ id: "workspace-1" }) });

        expect(mockPrefetchQuery).toHaveBeenCalledWith({
            queryKey: ["workspace", "workspace-1"],
            queryFn: expect.any(Function),
            staleTime: Infinity,
        });
        await expect(
            mockPrefetchQuery.mock.calls[0][0].queryFn(),
        ).resolves.toBe(workspace);
    });
});
