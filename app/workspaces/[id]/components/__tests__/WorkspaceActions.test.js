import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import WorkspaceActions from "../WorkspaceActions";
import {
    useDeleteWorkspace,
    useWorkspace,
} from "../../../../queries/workspaces";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
    __esModule: true,
    useRouter: () => ({
        push: mockPush,
    }),
}));

jest.mock("react-i18next", () => ({
    __esModule: true,
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("@tanstack/react-query", () => ({
    __esModule: true,
    useMutation: () => ({
        mutateAsync: jest.fn(),
        isError: false,
        isLoading: false,
    }),
    useQueryClient: () => ({
        cancelQueries: jest.fn(),
        getQueryData: jest.fn(),
        setQueryData: jest.fn(),
        invalidateQueries: jest.fn(),
    }),
}));

jest.mock("@/components/ui/dropdown-menu", () => ({
    __esModule: true,
    DropdownMenu: ({ children }) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }) => <div>{children}</div>,
    DropdownMenuContent: ({ children }) => <div>{children}</div>,
    DropdownMenuItem: ({ children }) => <div>{children}</div>,
}));

jest.mock("@/components/ui/alert-dialog", () => ({
    __esModule: true,
    AlertDialog: ({ children }) => <div>{children}</div>,
    AlertDialogAction: ({ children, onClick, disabled }) => (
        <button type="button" onClick={onClick} disabled={disabled}>
            {children}
        </button>
    ),
    AlertDialogCancel: ({ children }) => (
        <button type="button">{children}</button>
    ),
    AlertDialogContent: ({ children }) => <div>{children}</div>,
    AlertDialogDescription: ({ children }) => <p>{children}</p>,
    AlertDialogFooter: ({ children }) => <div>{children}</div>,
    AlertDialogHeader: ({ children }) => <div>{children}</div>,
    AlertDialogTitle: ({ children }) => <h2>{children}</h2>,
}));

jest.mock("../../../../../@/components/ui/modal", () => ({
    __esModule: true,
    Modal: ({ show, children }) => (show ? <div>{children}</div> : null),
}));

jest.mock("../../../../../@/components/share/ShareButton", () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock("../../../../queries/workspaces", () => ({
    __esModule: true,
    useWorkspace: jest.fn(),
    useDeleteWorkspace: jest.fn(),
    useCopyWorkspace: jest.fn(),
    usePublishWorkspace: jest.fn(),
}));

jest.mock("../../../../queries/pathways", () => ({
    __esModule: true,
    usePathway: jest.fn(),
}));

jest.mock("../../../../queries/modelMetadata", () => ({
    __esModule: true,
    useChatModels: jest.fn(() => ({ data: [] })),
}));

jest.mock("../../../../queries/prompts", () => ({
    __esModule: true,
    usePromptsByIds: jest.fn(() => ({ data: [] })),
}));

jest.mock("../../../../../src/App", () => {
    const React = require("react");
    return {
        __esModule: true,
        AuthContext: React.createContext({
            user: { _id: "user-1", username: "owner" },
        }),
        ServerContext: React.createContext({
            serverUrl: "https://concierge.test",
        }),
    };
});

jest.mock("../../../../../src/contexts/LanguageProvider", () => {
    const React = require("react");
    return {
        __esModule: true,
        LanguageContext: React.createContext({ direction: "ltr" }),
    };
});

describe("WorkspaceActions", () => {
    const workspace = {
        _id: "workspace-1",
        name: "Planning Workspace",
        slug: "planning-workspace",
        owner: "user-1",
        published: false,
    };
    const deleteWorkspace = {
        mutateAsync: jest.fn().mockResolvedValue({}),
        isPending: false,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        useWorkspace.mockReturnValue({ data: workspace, isLoading: false });
        useDeleteWorkspace.mockReturnValue(deleteWorkspace);
    });

    test("returns workspace pages to the Workspaces app-library tab", () => {
        render(
            <WorkspaceActions
                idOrSlug="workspace-1"
                user={{ _id: "user-1" }}
            />,
        );

        fireEvent.click(screen.getAllByRole("button")[0]);

        expect(mockPush).toHaveBeenCalledWith("/apps?tab=workspaces");
    });

    test("returns to the Workspaces app-library tab after deleting a workspace", async () => {
        render(
            <WorkspaceActions
                idOrSlug="workspace-1"
                user={{ _id: "user-1" }}
            />,
        );

        fireEvent.click(screen.getByText("Delete this workspace"));
        fireEvent.click(screen.getByRole("button", { name: "Delete" }));

        await waitFor(() => {
            expect(deleteWorkspace.mutateAsync).toHaveBeenCalledWith({
                id: "workspace-1",
            });
        });
        expect(mockPush).toHaveBeenCalledWith("/apps?tab=workspaces");
    });
});
