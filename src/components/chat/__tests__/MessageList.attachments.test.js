import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import MessageList from "../MessageList";

const mockResetScrollState = jest.fn();

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
        i18n: { language: "en" },
    }),
}));

jest.mock("../../../App", () => {
    const React = require("react");
    return {
        __esModule: true,
        AuthContext: React.createContext({
            user: { initials: "JD" },
        }),
        CurrentUserContext: React.createContext({
            initials: "JD",
        }),
    };
});

jest.mock("../../../../config", () => ({
    __esModule: true,
    default: {
        global: {
            getLogo: () => null,
        },
        chat: {
            botName: "Concierge",
        },
    },
}));

jest.mock("../../../../app/components/loader", () => ({
    __esModule: true,
    default: () => <div data-testid="loader" />,
}));

jest.mock("../../CopyButton", () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock("../../ReplayButton", () => ({
    __esModule: true,
    default: ({ onClick }) => <button onClick={onClick}>Replay</button>,
}));

jest.mock("../MediaCard", () => ({
    __esModule: true,
    default: ({ filename, type }) => (
        <div data-testid="media-card" data-media-type={type}>
            {filename}
        </div>
    ),
    ImageWithFallback: () => null,
}));

jest.mock("../BotMessage", () => ({
    __esModule: true,
    default: ({ message }) => (
        <div data-testid="bot-message" data-message-id={message?.id}>
            {typeof message?.payload === "string"
                ? message.payload
                : "assistant"}
        </div>
    ),
}));

jest.mock("../StreamingMessage", () => ({
    __esModule: true,
    default: () => <div data-testid="streaming-message" />,
}));

jest.mock("../ScrollToBottom", () => {
    const React = require("react");
    return {
        __esModule: true,
        default: React.forwardRef(function MockScrollToBottom(
            { children },
            ref,
        ) {
            React.useImperativeHandle(ref, () => ({
                resetScrollState: mockResetScrollState,
            }));
            return <div>{children}</div>;
        }),
    };
});

jest.mock("../../../../app/queries/chats", () => ({
    useUpdateChat: () => ({
        mutate: jest.fn(),
        mutateAsync: jest.fn(),
    }),
}));

jest.mock("@apollo/client", () => ({
    useApolloClient: () => ({}),
}));

jest.mock("../../../../app/workspaces/[id]/components/chatFileUtils", () => ({
    purgeFile: jest.fn(),
    createFilePlaceholder: jest.fn(() => "placeholder"),
}));

jest.mock("../../../../app/utils/class-names", () => ({
    __esModule: true,
    default: (...values) => values.filter(Boolean).join(" "),
}));

describe("MessageList user attachments", () => {
    const messages = [
        {
            payload: [
                JSON.stringify({ type: "text", text: "Please review this" }),
                JSON.stringify({
                    type: "image_url",
                    url: "https://example.com/mock-image.png",
                    image_url: {
                        url: "https://example.com/mock-image.png",
                    },
                    displayFilename: "mock-image.png",
                }),
            ],
            sender: "user",
            sentTime: "2026-03-09T00:00:00.000Z",
            direction: "outgoing",
            position: "single",
        },
    ];

    function renderMessageList(isStreaming = false) {
        return render(
            <MessageList
                messages={messages}
                bot="chat"
                loading={false}
                chatId="chat-1"
                streamingContent="partial reply"
                isStreaming={isStreaming}
                isChatLoading={isStreaming}
                onSend={jest.fn()}
                inlinePayloadItems={[]}
                thinkingDuration={0}
                isThinking={false}
                entities={[]}
            />,
        );
    }

    beforeEach(() => {
        mockResetScrollState.mockClear();
    });

    it("renders user attachments in a block container that survives streaming redraws", () => {
        const { rerender } = renderMessageList(false);

        const userContent = screen.getByText("Please review this", {
            selector: "div.chat-message-user",
            exact: false,
        });
        expect(userContent).toBeInTheDocument();
        expect(userContent).toHaveClass("chat-message-user");
        expect(screen.getByTestId("media-card")).toBeInTheDocument();

        rerender(
            <MessageList
                messages={messages}
                bot="chat"
                loading={false}
                chatId="chat-1"
                streamingContent="partial reply"
                isStreaming={true}
                isChatLoading={true}
                onSend={jest.fn()}
                inlinePayloadItems={[]}
                thinkingDuration={0}
                isThinking={false}
                entities={[]}
            />,
        );

        expect(
            screen.getByText("Please review this", {
                selector: "div.chat-message-user",
                exact: false,
            }),
        ).toHaveClass("chat-message-user");
        expect(screen.getByTestId("media-card")).toBeInTheDocument();
        expect(screen.getByTestId("streaming-message")).toBeInTheDocument();
    });

    it("renders non-image legacy attachment payloads as file cards", () => {
        render(
            <MessageList
                messages={[
                    {
                        payload: [
                            JSON.stringify({
                                type: "text",
                                text: "Can you tell me what this is?",
                            }),
                            JSON.stringify({
                                type: "image_url",
                                url: "https://example.com/concierge-install.sh",
                                image_url: {
                                    url: "https://example.com/concierge-install.sh",
                                },
                                displayFilename: "concierge-install.sh",
                            }),
                        ],
                        sender: "user",
                        sentTime: "2026-03-09T00:00:00.000Z",
                        direction: "outgoing",
                        position: "single",
                    },
                ]}
                bot="chat"
                loading={false}
                chatId="chat-1"
                streamingContent=""
                isStreaming={false}
                isChatLoading={false}
                onSend={jest.fn()}
                inlinePayloadItems={[]}
                thinkingDuration={0}
                isThinking={false}
                entities={[]}
            />,
        );

        expect(screen.getByTestId("media-card")).toHaveAttribute(
            "data-media-type",
            "file",
        );
        expect(screen.getByText("concierge-install.sh")).toBeInTheDocument();
    });

    it("uses server message ids when persisted messages share a sent time", () => {
        const consoleErrorSpy = jest
            .spyOn(console, "error")
            .mockImplementation(() => {});

        try {
            render(
                <MessageList
                    messages={[
                        {
                            _id: "server-user-message",
                            payload: "Digest prompt",
                            sender: "user",
                            sentTime: "2026-06-16T14:54:17.738Z",
                            direction: "outgoing",
                            position: "single",
                        },
                        {
                            _id: "server-assistant-message",
                            payload: "Digest answer",
                            sender: "assistant",
                            sentTime: "2026-06-16T14:54:17.738Z",
                            direction: "incoming",
                            position: "single",
                        },
                    ]}
                    bot="chat"
                    loading={false}
                    chatId="chat-1"
                    streamingContent=""
                    isStreaming={false}
                    isChatLoading={false}
                    onSend={jest.fn()}
                    inlinePayloadItems={[]}
                    thinkingDuration={0}
                    isThinking={false}
                    entities={[]}
                />,
            );

            expect(
                screen.getByTestId("message-wrapper-server-user-message"),
            ).toBeInTheDocument();
            expect(
                screen.getByTestId("message-wrapper-server-assistant-message"),
            ).toBeInTheDocument();
            expect(consoleErrorSpy).not.toHaveBeenCalledWith(
                expect.stringContaining(
                    "Encountered two children with the same key",
                ),
                expect.anything(),
            );
        } finally {
            consoleErrorSpy.mockRestore();
        }
    });

    it("renders the transient draft pair separately from settled history", () => {
        render(
            <MessageList
                messages={messages}
                pendingUserMessage={{
                    payload: "New question",
                    sender: "user",
                    sentTime: "2026-03-09T00:00:10.000Z",
                    direction: "outgoing",
                    position: "single",
                }}
                bot="chat"
                loading={true}
                chatId="chat-1"
                isStreaming={true}
                isChatLoading={true}
                onSend={jest.fn()}
                inlinePayloadItems={[]}
                thinkingDuration={0}
                isThinking={false}
                entities={[]}
            />,
        );

        expect(
            screen.getAllByText("Please review this", {
                selector: "div.chat-message-user",
                exact: false,
            }),
        ).toHaveLength(1);
        expect(
            screen.getByText("New question", {
                selector: "div.chat-message-user",
                exact: false,
            }),
        ).toBeInTheDocument();
        expect(screen.getByTestId("streaming-message")).toBeInTheDocument();
        expect(screen.queryByTestId("loader")).not.toBeInTheDocument();
        expect(
            screen.queryByText("Send a message to start a conversation"),
        ).not.toBeInTheDocument();
    });

    it("renders optimistic structured user payloads as text instead of raw JSON", () => {
        render(
            <MessageList
                messages={messages}
                pendingUserMessage={{
                    payload: [
                        JSON.stringify({
                            type: "text",
                            text: "Cool",
                        }),
                    ],
                    sender: "user",
                    sentTime: "2026-03-09T00:00:10.000Z",
                    direction: "outgoing",
                    position: "single",
                }}
                bot="chat"
                loading={false}
                chatId="chat-1"
                isStreaming={false}
                isChatLoading={false}
                onSend={jest.fn()}
                inlinePayloadItems={[]}
                thinkingDuration={0}
                isThinking={false}
                entities={[]}
            />,
        );

        expect(
            screen.getByText("Cool", {
                selector: "div.chat-message-user",
                exact: false,
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('{"type":"text","text":"Cool"}'),
        ).not.toBeInTheDocument();
    });

    it("keeps the transient assistant visible until settled history catches up", () => {
        render(
            <MessageList
                messages={messages}
                pendingUserMessage={{
                    payload: "New question",
                    sender: "user",
                    sentTime: "2026-03-09T00:00:10.000Z",
                    direction: "outgoing",
                    position: "single",
                }}
                pendingAssistantMessage={{
                    payload: "Draft answer",
                    sender: "assistant",
                    sentTime: "2026-03-09T00:00:11.000Z",
                    direction: "incoming",
                    position: "single",
                }}
                bot="chat"
                loading={false}
                chatId="chat-1"
                isStreaming={false}
                isChatLoading={false}
                onSend={jest.fn()}
                inlinePayloadItems={[]}
                thinkingDuration={0}
                isThinking={false}
                entities={[]}
            />,
        );

        expect(
            screen.getByText("New question", {
                selector: "div.chat-message-user",
                exact: false,
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByTestId("streaming-message"),
        ).not.toBeInTheDocument();
        expect(screen.getByTestId("bot-message")).toBeInTheDocument();
    });

    it("preserves draft pair DOM nodes when the settled pair arrives", () => {
        const baseMessages = [
            {
                payload: "Older settled question",
                sender: "user",
                sentTime: "2026-03-09T00:00:00.000Z",
                direction: "outgoing",
                position: "single",
                _clientId: "base-user",
            },
        ];
        const pendingUserMessage = {
            payload: [
                JSON.stringify({
                    type: "text",
                    text: "Cool",
                }),
            ],
            sender: "user",
            sentTime: "2026-03-09T00:00:10.000Z",
            direction: "outgoing",
            position: "single",
            _clientId: "draft-user:1",
        };
        const pendingAssistantMessage = {
            payload: "Draft answer",
            sender: "assistant",
            sentTime: "2026-03-09T00:00:11.000Z",
            direction: "incoming",
            position: "single",
            _clientId: "draft-assistant:1",
        };

        const { rerender } = render(
            <MessageList
                messages={baseMessages}
                pendingUserMessage={pendingUserMessage}
                pendingAssistantMessage={pendingAssistantMessage}
                bot="chat"
                loading={false}
                chatId="chat-1"
                isStreaming={false}
                isChatLoading={false}
                onSend={jest.fn()}
                inlinePayloadItems={[]}
                thinkingDuration={0}
                isThinking={false}
                entities={[]}
            />,
        );

        const beforeUserWrapper = screen.getByTestId(
            "message-wrapper-draft-user:1",
        );
        const beforeAssistantWrapper = screen.getByTestId(
            "message-wrapper-draft-assistant:1",
        );

        expect(beforeUserWrapper).toBeInTheDocument();
        expect(beforeAssistantWrapper).toBeInTheDocument();

        rerender(
            <MessageList
                messages={[
                    ...baseMessages,
                    {
                        ...pendingUserMessage,
                        _id: "server-user-1",
                    },
                    {
                        ...pendingAssistantMessage,
                        _id: "server-assistant-1",
                    },
                ]}
                bot="chat"
                loading={false}
                chatId="chat-1"
                isStreaming={false}
                isChatLoading={false}
                onSend={jest.fn()}
                inlinePayloadItems={[]}
                thinkingDuration={0}
                isThinking={false}
                entities={[]}
            />,
        );

        const afterUserWrapper = screen.getByTestId(
            "message-wrapper-draft-user:1",
        );
        const afterAssistantWrapper = screen.getByTestId(
            "message-wrapper-draft-assistant:1",
        );

        expect(afterUserWrapper).toBe(beforeUserWrapper);
        expect(afterAssistantWrapper).toBe(beforeAssistantWrapper);
    });

    it("still resets scroll state when switching between persisted chats", () => {
        const { rerender } = render(
            <MessageList
                messages={[]}
                bot="chat"
                loading={false}
                chatId="507f1f77bcf86cd799439061"
                isStreaming={false}
                isChatLoading={false}
                onSend={jest.fn()}
                inlinePayloadItems={[]}
                thinkingDuration={0}
                isThinking={false}
                entities={[]}
            />,
        );

        mockResetScrollState.mockClear();

        rerender(
            <MessageList
                messages={[]}
                bot="chat"
                loading={false}
                chatId="507f1f77bcf86cd799439062"
                isStreaming={false}
                isChatLoading={false}
                onSend={jest.fn()}
                inlinePayloadItems={[]}
                thinkingDuration={0}
                isThinking={false}
                entities={[]}
            />,
        );

        expect(mockResetScrollState).toHaveBeenCalledTimes(1);
    });
});
