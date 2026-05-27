import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import UnifiedFileManager from "../UnifiedFileManager";

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("react-toastify", () => ({
    toast: {
        error: jest.fn(),
        success: jest.fn(),
    },
}));

jest.mock(
    "@/src/components/images/hooks/useItemSelection",
    () => {
        const React = require("react");

        return {
            __esModule: true,
            useItemSelection: () => {
                const [selectedIds, setSelectedIds] = React.useState(
                    () => new Set(),
                );
                const [selectedObjects, setSelectedObjects] = React.useState(
                    [],
                );

                return {
                    selectedIds,
                    selectedObjects,
                    clearSelection: jest.fn(),
                    toggleSelection: jest.fn(),
                    selectRange: jest.fn(),
                    setSelectedIds,
                    setSelectedObjects,
                    lastSelectedId: null,
                    setLastSelectedId: jest.fn(),
                };
            },
        };
    },
    { virtual: true },
);

jest.mock(
    "@/src/utils/fileDownloadUtils",
    () => ({
        __esModule: true,
        getDownloadUrl: (url) => url,
    }),
    { virtual: true },
);

jest.mock("../useUnifiedFileData", () => {
    const files = [
        {
            _id: "one",
            displayFilename: "Alpha.txt",
            modifiedDate: "2026-03-01T00:00:00.000Z",
        },
    ];

    return {
        __esModule: true,
        collectAllFiles: (node) => node.files || [],
        useUnifiedFileData: () => ({
            tree: {
                files,
                children: {
                    chats: {
                        path: "chats",
                        files: [],
                        children: {},
                    },
                },
            },
            allFiles: files,
            loading: false,
            error: null,
            reloadFiles: jest.fn(),
            totalFileCount: files.length,
            getFilesRecursive: () => files,
            removeFileOptimistically: jest.fn(),
            renameFileOptimistically: jest.fn(),
            getSnapshot: jest.fn(() => files),
            revertToSnapshot: jest.fn(),
        }),
    };
});

jest.mock("../useFolderNavigation", () => ({
    __esModule: true,
    useFolderNavigation: () => ({
        selectedPath: "",
        expandedPaths: new Set(),
        selectFolder: jest.fn(),
        toggleExpanded: jest.fn(),
        isExpanded: jest.fn(() => false),
        isSelected: jest.fn((path) => path === ""),
        breadcrumbs: [{ label: "All Files", path: "" }],
    }),
}));

jest.mock("../SidebarFolderTree", () => ({
    __esModule: true,
    default: () => <div data-testid="sidebar-tree" />,
}));

jest.mock("../FileGridView", () => ({
    __esModule: true,
    default: () => <div data-testid="file-grid-view" />,
}));

jest.mock("../FileStatusBar", () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock(
    "@/src/components/common/BulkActionsBar",
    () => ({
        __esModule: true,
        default: () => null,
    }),
    { virtual: true },
);

jest.mock(
    "@/src/components/common/EmptyState",
    () => ({
        __esModule: true,
        default: () => <div data-testid="empty-state" />,
    }),
    { virtual: true },
);

jest.mock(
    "@/components/ui/spinner",
    () => ({
        __esModule: true,
        Spinner: () => <div data-testid="spinner" />,
    }),
    { virtual: true },
);

jest.mock(
    "@/components/ui/alert-dialog",
    () => ({
        AlertDialog: ({ children }) => <div>{children}</div>,
        AlertDialogContent: ({ children }) => <div>{children}</div>,
        AlertDialogHeader: ({ children }) => <div>{children}</div>,
        AlertDialogTitle: ({ children }) => <div>{children}</div>,
        AlertDialogDescription: ({ children }) => <div>{children}</div>,
        AlertDialogFooter: ({ children }) => <div>{children}</div>,
        AlertDialogAction: ({ children, ...props }) => (
            <button type="button" {...props}>
                {children}
            </button>
        ),
        AlertDialogCancel: ({ children, ...props }) => (
            <button type="button" {...props}>
                {children}
            </button>
        ),
    }),
    { virtual: true },
);

jest.mock(
    "@/src/components/common/FileManager",
    () => ({
        __esModule: true,
        getFileUrl: jest.fn(() => null),
        getFilename: (file) =>
            file.displayFilename || file.displayName || file.filename || "",
        getFileDate: (file) =>
            file.modifiedDate ? new Date(file.modifiedDate) : null,
        createFileId: (file) => `id-${file._id}`,
        FilePreviewDialog: () => null,
    }),
    { virtual: true },
);

jest.mock("../FileContentArea", () => ({
    __esModule: true,
    default: () => <div data-testid="file-content-area" />,
}));

describe("UnifiedFileManager mobile layout", () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.innerWidth = 375;
    });

    it("forces list view on mobile and keeps folders behind a toggle", () => {
        window.localStorage.setItem("unified-file-manager-view-mode", "grid");

        render(
            <UnifiedFileManager contextId="ctx-1" containerHeight="400px" />,
        );

        expect(screen.getByTestId("file-content-area")).toBeInTheDocument();
        expect(screen.queryByTestId("file-grid-view")).not.toBeInTheDocument();
        expect(screen.queryByTestId("sidebar-tree")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /all files/i }));

        expect(screen.getByTestId("sidebar-tree")).toBeInTheDocument();
    });
});
