import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import Applets from "../Applets";
import { useAddChat } from "../../../queries/chats";
import { useCreateWorkspace, useWorkspaces } from "../../../queries/workspaces";
import { launchAppletGeneration } from "@/src/utils/appletGeneration";
import { useDispatch } from "react-redux";

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

jest.mock("@/components/ui/tooltip", () => ({
    __esModule: true,
    Tooltip: ({ children }) => <>{children}</>,
    TooltipTrigger: ({ children }) => <>{children}</>,
    TooltipContent: ({ children }) => <div>{children}</div>,
    TooltipProvider: ({ children }) => <>{children}</>,
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
                forceNew: true,
                isUnused: false,
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

    test("creates legacy workspaces from the applets page", async () => {
        render(<Applets />);

        fireEvent.click(
            await screen.findByRole("button", { name: "Create Workspace" }),
        );

        await waitFor(() => {
            expect(mockCreateWorkspace.mutateAsync).toHaveBeenCalledWith({
                name: "New Workspace",
            });
        });
        expect(mockPush).toHaveBeenCalledWith("/workspaces/ws-1");
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
                            filePath: "https://example.com/live.html",
                            updatedAt: "2026-05-06T00:00:00.000Z",
                        },
                    ],
                }),
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
});
