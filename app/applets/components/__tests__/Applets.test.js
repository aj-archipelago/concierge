import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import Applets from "../Applets";
import { useAddChat } from "../../../queries/chats";
import { useCreateWorkspace, useWorkspaces } from "../../../queries/workspaces";
import { useCurrentUser } from "../../../queries/users";
import { launchAppletGeneration } from "@/src/utils/appletGeneration";
import { useDispatch } from "react-redux";
import { useQueryClient } from "@tanstack/react-query";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
    __esModule: true,
    useRouter: () => ({
        push: mockPush,
    }),
}));

jest.mock("react-redux", () => ({
    __esModule: true,
    useDispatch: jest.fn(),
}));

jest.mock("react-i18next", () => ({
    __esModule: true,
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("@/src/App", () => {
    const React = require("react");
    return {
        __esModule: true,
        AuthContext: React.createContext({
            user: { _id: "user-1", contextId: "ctx-1" },
        }),
    };
});

jest.mock("@/src/contexts/LanguageProvider", () => {
    const React = require("react");
    return {
        __esModule: true,
        LanguageContext: React.createContext({ direction: "ltr" }),
    };
});

jest.mock("../../../queries/chats", () => ({
    __esModule: true,
    useAddChat: jest.fn(),
}));

jest.mock("../../../queries/workspaces", () => ({
    __esModule: true,
    useWorkspaces: jest.fn(),
    useCreateWorkspace: jest.fn(),
}));

jest.mock("../../../queries/users", () => ({
    __esModule: true,
    useCurrentUser: jest.fn(),
}));

jest.mock("@tanstack/react-query", () => ({
    __esModule: true,
    useQueryClient: jest.fn(),
}));

jest.mock("@/src/utils/appletGeneration", () => ({
    __esModule: true,
    deriveAppletName: jest.fn(() => "Timer"),
    launchAppletGeneration: jest.fn(),
}));

jest.mock("@/src/components/chat/canvas/GenerateHtmlDialog", () => ({
    __esModule: true,
    default: ({ show, onGenerate }) =>
        show ? (
            <button
                type="button"
                onClick={() => onGenerate("Build a timer applet")}
            >
                Mock Generate Applet
            </button>
        ) : null,
}));

jest.mock("@/components/share/ShareButton", () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock("@/components/share/ShareDialog", () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock("@/components/share/useShareSettings", () => ({
    __esModule: true,
    useShareSettings: () => ({ isShared: false }),
}));

jest.mock("@/components/ui/tooltip", () => ({
    __esModule: true,
    Tooltip: ({ children }) => <>{children}</>,
    TooltipTrigger: ({ children }) => <>{children}</>,
    TooltipContent: ({ children }) => <div>{children}</div>,
    TooltipProvider: ({ children }) => <>{children}</>,
}));

jest.mock("@/components/ui/dropdown-menu", () => ({
    __esModule: true,
    DropdownMenu: ({ children }) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }) => children,
    DropdownMenuContent: ({ children, align: _align, ...props }) => (
        <div role="menu" {...props}>
            {children}
        </div>
    ),
    DropdownMenuItem: ({ children, onClick, onSelect, ...props }) => (
        <button
            type="button"
            role="menuitem"
            onClick={(event) => {
                onClick?.(event);
                onSelect?.(event);
            }}
            {...props}
        >
            {children}
        </button>
    ),
    DropdownMenuCheckboxItem: ({
        children,
        checked,
        onCheckedChange,
        ...props
    }) => (
        <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={checked ? "true" : "false"}
            onClick={() => onCheckedChange?.(!checked)}
            {...props}
        >
            {children}
        </button>
    ),
    DropdownMenuSeparator: () => <hr />,
}));

describe("Applets", () => {
    const mockDispatch = jest.fn();
    const mockCreateWorkspace = {
        mutateAsync: jest.fn(),
        isPending: false,
    };
    const mockAddChat = {
        mutateAsync: jest.fn(),
        isPending: false,
    };
    const mockQueryClient = {
        invalidateQueries: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        window.history.pushState({}, "", "/applets");
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ applets: [] }),
        });

        useDispatch.mockReturnValue(mockDispatch);
        useAddChat.mockReturnValue(mockAddChat);
        useWorkspaces.mockReturnValue({ data: [], isLoading: false });
        useCreateWorkspace.mockReturnValue(mockCreateWorkspace);
        useCurrentUser.mockReturnValue({ data: { apps: [] } });
        useQueryClient.mockReturnValue(mockQueryClient);
        launchAppletGeneration.mockReturnValue({
            completion: Promise.resolve(),
        });
        mockAddChat.mutateAsync.mockResolvedValue({ _id: "chat-1" });
        mockCreateWorkspace.mutateAsync.mockResolvedValue({ _id: "ws-1" });
    });

    test("creates applets in a persisted chat with canvas attached", async () => {
        render(<Applets />);

        const createAppletButtons = await screen.findAllByRole("button", {
            name: "Create Applet",
        });
        fireEvent.click(createAppletButtons[0]);
        fireEvent.click(
            screen.getByRole("button", { name: "Mock Generate Applet" }),
        );

        await waitFor(() => {
            expect(mockAddChat.mutateAsync).toHaveBeenCalledWith({
                messages: [],
                title: "Timer",
            });
        });
        expect(mockDispatch).toHaveBeenCalledWith({
            type: "chat/setActiveCanvasChat",
            payload: "chat-1",
        });
        expect(launchAppletGeneration).toHaveBeenCalledWith(
            expect.objectContaining({
                prompt: "Build a timer applet",
                dispatch: mockDispatch,
                userContextId: "ctx-1",
                appletName: "Timer",
            }),
        );
        expect(mockPush).toHaveBeenCalledWith("/chat/chat-1");
    });

    test("creates legacy workspaces from the workspace tab", async () => {
        render(<Applets scope="workspaces" />);

        const createWorkspaceButtons = await screen.findAllByRole("button", {
            name: "Create Workspace",
        });
        fireEvent.click(createWorkspaceButtons[0]);

        await waitFor(() => {
            expect(mockCreateWorkspace.mutateAsync).toHaveBeenCalledWith({
                name: "New Workspace",
            });
        });
        expect(mockPush).toHaveBeenCalledWith("/workspaces/ws-1");
    });

    test("keeps workspace creation out of My Applets", async () => {
        render(<Applets />);

        expect(
            await screen.findAllByRole("button", { name: "Create Applet" }),
        ).not.toHaveLength(0);
        expect(
            screen.queryByRole("button", { name: "Create Workspace" }),
        ).not.toBeInTheDocument();
    });

    test("opens canvas applets from the mutable Draft blob before saved versions", async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    applets: [
                        {
                            _id: "applet-1",
                            version: 2,
                            name: "Registry Applet",
                            isOwner: true,
                            filePath: "https://example.com/live.html",
                            updatedAt: "2026-05-06T00:00:00.000Z",
                        },
                    ],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ homeAppletId: null }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "applet-1",
                    version: 2,
                    name: "Registry Applet",
                    filePath: "https://example.com/live.html",
                    workspacePath: "/workspace/files/applets/registry.html",
                    htmlVersions: [
                        { content: "<html>old saved</html>" },
                        { content: "<html>latest saved</html>" },
                    ],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => "<html>draft blob</html>",
            });

        render(<Applets />);

        fireEvent.click(await screen.findByText("Registry Applet"));

        await waitFor(() => {
            expect(mockDispatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    payload: expect.objectContaining({
                        appletId: "applet-1",
                        htmlContent: "<html>draft blob</html>",
                        url: "https://example.com/live.html",
                    }),
                }),
            );
        });
    });

    test("sets a canvas applet as the home page", async () => {
        global.fetch = jest.fn((url, options = {}) => {
            if (url === "/api/canvas-applets") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        applets: [
                            {
                                _id: "applet-1",
                                version: 2,
                                name: "Home Candidate",
                                isOwner: true,
                                updatedAt: "2026-05-06T00:00:00.000Z",
                            },
                        ],
                    }),
                });
            }
            if (
                url === "/api/users/me/home-applet" &&
                options.method === "PUT"
            ) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ homeAppletId: "applet-1" }),
                });
            }
            if (url === "/api/users/me/home-applet") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ homeAppletId: null }),
                });
            }
            return Promise.resolve({
                ok: false,
                json: async () => ({}),
            });
        });

        render(<Applets />);

        expect(await screen.findByText("Home Candidate")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "More actions" }));
        fireEvent.click(
            screen.getByRole("menuitemcheckbox", {
                name: "Set as home applet",
            }),
        );

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/users/me/home-applet",
                expect.objectContaining({
                    method: "PUT",
                    body: JSON.stringify({ appletId: "applet-1" }),
                }),
            );
        });
        fireEvent.click(screen.getByRole("button", { name: "More actions" }));
        await waitFor(() => {
            expect(
                screen.getByRole("menuitemcheckbox", {
                    name: "Unset home applet",
                }),
            ).toHaveAttribute("aria-checked", "true");
        });
        expect(screen.getByText("Home applet")).toBeInTheDocument();
        expect(
            screen.queryByText("Home", { selector: "span" }),
        ).not.toBeInTheDocument();
    });

    test("shows Home directory membership on canvas applets without order controls", async () => {
        global.fetch = jest.fn((url, options = {}) => {
            if (url === "/api/canvas-applets") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        applets: [
                            {
                                _id: "applet-1",
                                version: 2,
                                name: "First Home Card",
                                isOwner: true,
                                updatedAt: "2026-05-06T00:00:00.000Z",
                            },
                            {
                                _id: "applet-2",
                                version: 2,
                                name: "Second Home Card",
                                isOwner: true,
                                updatedAt: "2026-05-07T00:00:00.000Z",
                            },
                        ],
                    }),
                });
            }
            if (url === "/api/users/me/home-applet") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        homeAppletId: null,
                        homeAppletIds: ["applet-1", "applet-2"],
                    }),
                });
            }
            if (url === "/api/users/me/home-applet-directory") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ homeAppletIds: ["applet-2"] }),
                });
            }
            return Promise.resolve({
                ok: false,
                json: async () => ({}),
            });
        });

        render(<Applets />);

        expect(await screen.findByText("First Home Card")).toBeInTheDocument();
        expect(screen.getAllByText("On Home")).toHaveLength(2);
        expect(
            screen.getAllByRole("button", { name: "More actions" }),
        ).toHaveLength(2);
        expect(screen.queryByText("Home directory")).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Move earlier on Home" }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Move later on Home" }),
        ).not.toBeInTheDocument();

        fireEvent.click(
            screen.getAllByRole("menuitemcheckbox", {
                name: "Remove from Home",
            })[1],
        );
        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/users/me/home-applet-directory",
                expect.objectContaining({
                    method: "DELETE",
                    body: JSON.stringify({ appletId: "applet-1" }),
                }),
            );
        });
    });

    test("installs canvas applets from the applets page", async () => {
        global.fetch = jest.fn((url, options = {}) => {
            if (url === "/api/canvas-applets") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        applets: [
                            {
                                _id: "applet-1",
                                version: 2,
                                name: "Sidebar Timer",
                                isOwner: true,
                                updatedAt: "2026-05-06T00:00:00.000Z",
                            },
                        ],
                    }),
                });
            }
            if (url === "/api/users/me/home-applet") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ homeAppletId: null }),
                });
            }
            if (
                url === "/api/canvas-applets/applet-1/install" &&
                options.method === "POST"
            ) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ apps: [] }),
                });
            }
            return Promise.resolve({
                ok: false,
                json: async () => ({}),
            });
        });

        render(<Applets />);

        expect(await screen.findByText("Sidebar Timer")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "More actions" }));
        fireEvent.click(
            await screen.findByRole("menuitemcheckbox", {
                name: /Add to sidebar/i,
            }),
        );

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/canvas-applets/applet-1/install",
                { method: "POST" },
            );
        });
        expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
            queryKey: ["currentUser"],
        });
    });

    test("sorts applet tabs from the shared control bar", async () => {
        global.fetch = jest.fn((url) => {
            if (url === "/api/canvas-applets") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        applets: [
                            {
                                _id: "applet-beta",
                                version: 2,
                                name: "Beta Timer",
                                isOwner: true,
                                updatedAt: "2026-06-18T00:00:00.000Z",
                            },
                            {
                                _id: "applet-alpha",
                                version: 2,
                                name: "Alpha Timer",
                                isOwner: true,
                                updatedAt: "2026-06-17T00:00:00.000Z",
                            },
                        ],
                    }),
                });
            }
            if (url === "/api/users/me/home-applet") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ homeAppletId: null }),
                });
            }
            return Promise.resolve({
                ok: false,
                json: async () => ({}),
            });
        });

        render(<Applets />);

        const beta = await screen.findByText("Beta Timer");
        const alpha = screen.getByText("Alpha Timer");
        expect(
            beta.compareDocumentPosition(alpha) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();

        fireEvent.change(screen.getByRole("combobox", { name: "Sort:" }), {
            target: { value: "name-asc" },
        });

        expect(
            screen
                .getByText("Alpha Timer")
                .compareDocumentPosition(screen.getByText("Beta Timer")) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    test("removes installed applets from the sidebar on the applets page", async () => {
        useCurrentUser.mockReturnValue({
            data: {
                apps: [
                    {
                        appId: {
                            _id: "app-1",
                            type: "applet",
                            appletId: "applet-1",
                        },
                    },
                ],
            },
        });
        global.fetch = jest.fn((url, options = {}) => {
            if (url === "/api/canvas-applets") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        applets: [
                            {
                                _id: "applet-1",
                                version: 2,
                                name: "Installed Timer",
                                isOwner: true,
                                updatedAt: "2026-05-06T00:00:00.000Z",
                            },
                        ],
                    }),
                });
            }
            if (url === "/api/users/me/home-applet") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ homeAppletId: null }),
                });
            }
            if (
                url === "/api/canvas-applets/applet-1/install" &&
                options.method === "DELETE"
            ) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ apps: [] }),
                });
            }
            return Promise.resolve({
                ok: false,
                json: async () => ({}),
            });
        });

        render(<Applets />);

        expect(await screen.findByText("Installed Timer")).toBeInTheDocument();
        expect(screen.getByText("In sidebar")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "More actions" }));
        fireEvent.click(
            await screen.findByRole("menuitemcheckbox", {
                name: /Remove from sidebar/i,
            }),
        );

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/canvas-applets/applet-1/install",
                { method: "DELETE" },
            );
        });
    });

    test("migrates legacy workspace applets before opening them in canvas", async () => {
        useWorkspaces.mockReturnValue({
            data: [
                {
                    _id: "workspace-1",
                    applet: "legacy-applet-1",
                    name: "Legacy Workspace",
                    publishedAppletName: "Legacy Applet",
                    updatedAt: "2026-05-05T00:00:00.000Z",
                },
            ],
            isLoading: false,
        });
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ applets: [] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    appletId: "legacy-applet-1",
                    workspaceId: "workspace-1",
                    applet: {
                        _id: "legacy-applet-1",
                        version: 2,
                        name: "Legacy Applet",
                        filePath: "https://example.com/migrated.html",
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    _id: "legacy-applet-1",
                    version: 2,
                    name: "Legacy Applet",
                    filePath: "https://example.com/migrated.html",
                    workspacePath: "/workspace/files/applets/migrated.html",
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => "<html>migrated draft</html>",
            });

        render(<Applets scope="workspaces" />);

        fireEvent.click(await screen.findByText("Legacy Applet"));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/canvas-applets/migrate",
                expect.objectContaining({
                    method: "POST",
                    body: JSON.stringify({
                        workspaceId: "workspace-1",
                        appletId: "legacy-applet-1",
                    }),
                }),
            );
        });
        expect(screen.getByRole("status")).toHaveTextContent(
            "Migrating applet...",
        );
        expect(screen.getByRole("status")).toHaveTextContent("Legacy Applet");
        await waitFor(() => {
            expect(mockDispatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    payload: expect.objectContaining({
                        appletId: "legacy-applet-1",
                        htmlContent: "<html>migrated draft</html>",
                        title: "Legacy Applet",
                    }),
                }),
            );
        });
    });

    test("keeps migrated workspace rows out of My Applets and removes card type metadata", async () => {
        useWorkspaces.mockReturnValue({
            data: [
                {
                    _id: "workspace-1",
                    applet: "applet-1",
                    name: "Migrated Workspace",
                    updatedAt: "2026-05-05T00:00:00.000Z",
                },
            ],
            isLoading: false,
        });
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    applets: [
                        {
                            _id: "applet-1",
                            version: 2,
                            name: "Migrated Workspace",
                            filePath: "https://example.com/migrated.html",
                            updatedAt: "2026-05-06T00:00:00.000Z",
                        },
                    ],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ homeAppletId: null }),
            });

        render(<Applets />);

        await waitFor(() => {
            expect(screen.getAllByText("Migrated Workspace")).toHaveLength(1);
        });
        expect(useWorkspaces).toHaveBeenCalledWith({ enabled: false });
        expect(screen.queryByText("Canvas")).not.toBeInTheDocument();
        expect(screen.queryByText("Legacy workspace")).not.toBeInTheDocument();
    });

    test("shows all workspace rows in the workspace tab without a toggle", async () => {
        useCurrentUser.mockReturnValue({
            data: {
                apps: [
                    {
                        appId: {
                            _id: "app-1",
                            type: "applet",
                            appletId: "applet-1",
                        },
                    },
                    {
                        appId: {
                            _id: "app-3",
                            type: "applet",
                            appletId: "legacy-applet-3",
                        },
                    },
                ],
            },
        });
        useWorkspaces.mockReturnValue({
            data: [
                {
                    _id: "workspace-1",
                    applet: "applet-1",
                    name: "Wirey Workspace",
                    publishedAppletName: "Published Applet Name",
                    hasPublishedApplet: true,
                    updatedAt: "2026-05-05T00:00:00.000Z",
                },
                {
                    _id: "workspace-2",
                    applet: null,
                    name: "Prompt Workspace",
                    updatedAt: "2026-05-04T00:00:00.000Z",
                },
                {
                    _id: "workspace-3",
                    applet: "legacy-applet-3",
                    name: "Unmigrated Workspace",
                    publishedAppletName: "Unmigrated Applet",
                    hasPublishedApplet: true,
                    updatedAt: "2026-05-03T00:00:00.000Z",
                },
            ],
            isLoading: false,
        });
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    applets: [
                        {
                            _id: "applet-1",
                            version: 2,
                            name: "Wirey",
                            filePath: "https://example.com/migrated.html",
                            updatedAt: "2026-05-06T00:00:00.000Z",
                        },
                    ],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ homeAppletId: null }),
            });

        render(<Applets scope="workspaces" />);

        expect(
            await screen.findByPlaceholderText("Search workspaces..."),
        ).toBeInTheDocument();
        expect(screen.getByText("3 Workspaces")).toBeInTheDocument();
        expect(screen.getByText("Wirey Workspace")).toBeInTheDocument();
        expect(
            screen.queryByText("Published Applet Name"),
        ).not.toBeInTheDocument();
        expect(screen.getByText("Prompt Workspace")).toBeInTheDocument();
        expect(screen.getByText("Unmigrated Applet")).toBeInTheDocument();
        expect(screen.getByText("Applet dependency")).toBeInTheDocument();
        expect(screen.getByText("Unmigrated applet")).toBeInTheDocument();
        expect(screen.queryByText("In sidebar")).not.toBeInTheDocument();
        expect(
            screen.queryByRole("checkbox", { name: "Show all workspaces" }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText("Legacy workspace")).not.toBeInTheDocument();
        expect(screen.queryByText("Workspace")).not.toBeInTheDocument();

        fireEvent.click(screen.getByText("Wirey Workspace"));
        expect(mockPush).toHaveBeenCalledWith("/workspaces/workspace-1");

        fireEvent.click(screen.getByText("Prompt Workspace"));

        expect(mockPush).toHaveBeenCalledWith("/workspaces/workspace-2");
    });

    test("shared scope only shows shared canvas applets", async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    applets: [
                        {
                            _id: "owned-applet",
                            version: 2,
                            name: "Owned Applet",
                            isOwner: true,
                            updatedAt: "2026-05-06T00:00:00.000Z",
                        },
                        {
                            _id: "shared-applet",
                            version: 2,
                            name: "Shared Applet",
                            isOwner: false,
                            isShared: true,
                            shareRole: "viewer",
                            updatedAt: "2026-05-07T00:00:00.000Z",
                        },
                    ],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ homeAppletId: null }),
            });

        render(<Applets scope="shared" />);

        expect(await screen.findByText("Shared Applet")).toBeInTheDocument();
        expect(useWorkspaces).toHaveBeenCalledWith({ enabled: false });
        expect(global.fetch).not.toHaveBeenCalledWith(
            "/api/users/me/home-applet",
        );
        expect(screen.queryByText("Owned Applet")).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Create Applet" }),
        ).not.toBeInTheDocument();
    });

    test("default scope hides applets shared by other users", async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    applets: [
                        {
                            _id: "owned-applet",
                            version: 2,
                            name: "Owned Applet",
                            isOwner: true,
                            updatedAt: "2026-05-06T00:00:00.000Z",
                        },
                        {
                            _id: "shared-applet",
                            version: 2,
                            name: "Shared Applet",
                            isOwner: false,
                            isShared: true,
                            shareRole: "viewer",
                            updatedAt: "2026-05-07T00:00:00.000Z",
                        },
                    ],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ homeAppletId: null }),
            });

        render(<Applets />);

        expect(await screen.findByText("Owned Applet")).toBeInTheDocument();
        expect(screen.queryByText("Shared Applet")).not.toBeInTheDocument();
    });
});
