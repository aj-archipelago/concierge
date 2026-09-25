import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import HomeModifyAppletDialog from "./HomeModifyAppletDialog";

const mockDispatch = jest.fn();
const mockSetPageContext = jest.fn();
const mockClearPageContext = jest.fn();

jest.mock("react-i18next", () => ({
    __esModule: true,
    useTranslation: () => ({ t: (key) => key }),
}));

jest.mock("@/src/contexts/LanguageProvider", () => {
    const React = require("react");
    return {
        __esModule: true,
        LanguageContext: React.createContext({
            direction: "ltr",
            language: "en",
        }),
    };
});

jest.mock("@/src/App.js", () => {
    const React = require("react");
    return {
        CurrentUserContext: React.createContext({
            contextId: "user-1",
            aiName: "Concierge",
        }),
        ServerContext: React.createContext({}),
        AuthContext: React.createContext({}),
    };
});

jest.mock("react-redux", () => ({
    useDispatch: () => mockDispatch,
    useSelector: (selector) =>
        selector({
            chat: {
                chatBox: { position: "docked" },
                canvasContent: { appletId: "applet-1" },
                canvasVisible: true,
            },
        }),
}));

jest.mock("@/src/hooks/useEntities", () => ({
    useEntities: () => ({ entities: [], defaultEntityId: "entity-1" }),
}));

jest.mock("@/src/contexts/PageContextProvider", () => ({
    usePageContext: () => ({
        setPageContext: mockSetPageContext,
        clearPageContext: mockClearPageContext,
    }),
}));

var mockUpdateChatMutate = jest.fn();
var mockActiveChatMessages = [];
var lastChatContentChat = null;

jest.mock("../../queries/chats", () => ({
    useGetUserChatInfo: () => ({
        data: { activeChatId: "chat-1" },
        isFetched: true,
    }),
    useGetActiveChat: () => ({
        data: {
            _id: "chat-1",
            messages: mockActiveChatMessages,
            selectedEntityId: "entity-1",
        },
        isFetched: true,
        isError: false,
    }),
    useAddChat: () => ({ mutateAsync: jest.fn() }),
    useSetActiveChatId: () => ({ mutateAsync: jest.fn() }),
    useGetChatById: (chatId) => ({
        data: chatId
            ? {
                  _id: chatId,
                  messages: mockActiveChatMessages,
                  selectedEntityId: "entity-1",
              }
            : undefined,
    }),
    useUpdateChat: () => ({
        mutate: (payload) => {
            mockUpdateChatMutate(payload);
            if (Array.isArray(payload?.messages)) {
                mockActiveChatMessages = payload.messages;
            }
        },
    }),
}));

jest.mock("@/src/components/chat/ChatContent", () => ({
    __esModule: true,
    default: function MockChatContent({ chat }) {
        lastChatContentChat = chat;
        return (
            <div data-testid="mock-chat-content">
                {Array.isArray(chat?.messages) ? chat.messages.length : 0}
            </div>
        );
    },
}));

jest.mock("@/src/components/chat/Canvas", () => ({
    __esModule: true,
    default: function MockCanvas({ editorLayout }) {
        return (
            <div
                data-testid="mock-canvas"
                data-editor-layout={editorLayout || ""}
            >
                Canvas
            </div>
        );
    },
}));

describe("HomeModifyAppletDialog", () => {
    const t = (key) => key;
    const applet = { appletId: "applet-1", name: "Toronto weather" };

    beforeEach(() => {
        mockDispatch.mockClear();
        mockSetPageContext.mockClear();
        mockClearPageContext.mockClear();
        mockUpdateChatMutate.mockClear();
        mockActiveChatMessages = [];
        lastChatContentChat = null;
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: async () => ({
                    name: "Toronto weather",
                    html: "<html><body>Full page</body></html>",
                    workspacePath: "/applets/toronto.html",
                }),
            }),
        );
    });

    test("opens the main chat and applet canvas in widget view", async () => {
        const onClose = jest.fn();
        render(
            <HomeModifyAppletDialog applet={applet} onClose={onClose} t={t} />,
        );

        expect(screen.getByText("Edit: Toronto weather")).toBeInTheDocument();
        expect(
            screen.getByTestId("home-modify-applet-clear-chat"),
        ).toBeDisabled();
        await waitFor(() => {
            expect(screen.getByTestId("mock-chat-content")).toBeInTheDocument();
        });
        expect(
            screen.getByRole("button", { name: "Close" }),
        ).toHaveAccessibleName("Close");
        expect(screen.getByTestId("home-modify-applet-chat").className).toMatch(
            /\bp-3\b/,
        );
        expect(screen.getByTestId("home-modify-applet-chat").className).toMatch(
            /sm:w-\[min\(22rem,34%\)\]/,
        );

        await waitFor(() => {
            expect(screen.getByTestId("mock-canvas")).toBeInTheDocument();
        });
        expect(screen.getByTestId("mock-canvas")).toHaveAttribute(
            "data-editor-layout",
            "applet-editor",
        );

        const openCanvasCall = mockDispatch.mock.calls.find(([action]) =>
            action?.type?.endsWith("/openCanvas"),
        );
        expect(openCanvasCall?.[0]?.payload).toEqual(
            expect.objectContaining({
                type: "html",
                appletId: "applet-1",
                appletViewMode: "widget",
                htmlContent: "<html><body>Full page</body></html>",
            }),
        );
        expect(mockSetPageContext).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    function: expect.objectContaining({
                        name: "UpdateAppletWidget",
                    }),
                }),
            ]),
            null,
            expect.objectContaining({
                updateappletwidget: expect.any(Function),
            }),
            null,
            "home-modify-applet",
        );

        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(onClose).toHaveBeenCalled();
    });

    test("passes live chat messages into ChatContent after the editor opens", async () => {
        const view = render(
            <HomeModifyAppletDialog
                applet={applet}
                onClose={jest.fn()}
                t={t}
            />,
        );

        await waitFor(() => {
            expect(screen.getByTestId("mock-canvas")).toBeInTheDocument();
        });
        const openCanvasCount = mockDispatch.mock.calls.filter(([action]) =>
            action?.type?.endsWith("/openCanvas"),
        ).length;

        mockActiveChatMessages = [
            { _id: "m1", role: "user", payload: "hello" },
            { _id: "m2", role: "assistant", payload: "hi" },
        ];
        view.rerender(
            <HomeModifyAppletDialog
                applet={applet}
                onClose={jest.fn()}
                t={t}
            />,
        );

        await waitFor(() => {
            expect(lastChatContentChat?.messages).toHaveLength(2);
        });
        expect(
            mockDispatch.mock.calls.filter(([action]) =>
                action?.type?.endsWith("/openCanvas"),
            ).length,
        ).toBe(openCanvasCount);
    });

    test("closes the floating chat box while the editor is open", () => {
        render(
            <HomeModifyAppletDialog
                applet={applet}
                onClose={jest.fn()}
                t={t}
            />,
        );

        expect(mockDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                payload: { position: "closed" },
            }),
        );
    });

    test("clears the editor chat after confirmation", async () => {
        mockActiveChatMessages = [{ _id: "m1", payload: "hello" }];
        render(
            <HomeModifyAppletDialog
                applet={applet}
                onClose={jest.fn()}
                t={t}
            />,
        );

        const clearButton = screen.getByTestId("home-modify-applet-clear-chat");
        await waitFor(() => {
            expect(clearButton).toBeEnabled();
        });
        fireEvent.click(clearButton);
        expect(screen.getByText("Clear Chat?")).toBeInTheDocument();

        fireEvent.click(
            screen.getByTestId("home-modify-applet-clear-chat-confirm"),
        );
        expect(mockUpdateChatMutate).toHaveBeenCalledWith({
            chatId: "chat-1",
            messages: [],
            title: "",
        });
        expect(clearButton).toBeDisabled();
    });
});
