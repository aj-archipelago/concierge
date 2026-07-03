import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { InlineAssistantPayload } from "../BotMessage";

const mockConvertMessageToMarkdown = jest.fn(({ payload }) => (
    <div data-testid="markdown">{payload}</div>
));

jest.mock("react-i18next", () => ({
    __esModule: true,
    useTranslation: () => ({
        t: (key, options) => {
            if (key === "Repeated count") {
                return `Repeated ${options?.value}`;
            }
            if (key === "Thinking with duration") {
                return `Thinking for ${options?.duration}s`;
            }
            if (key === "Thought for duration") {
                return `Thought for ${options?.duration}s`;
            }
            return key;
        },
        i18n: { language: "en" },
    }),
}));

jest.mock("../../../App", () => {
    const React = require("react");
    return {
        CurrentUserContext: React.createContext(null),
    };
});

jest.mock("../../../../app/queries/notifications", () => ({
    useTask: () => ({ data: null }),
    useCancelTask: () => ({ mutate: jest.fn() }),
}));

jest.mock("../ChatMessage", () => ({
    convertMessageToMarkdown: (...args) =>
        mockConvertMessageToMarkdown(...args),
}));

jest.mock("../MediaCard", () => ({
    __esModule: true,
    default: () => null,
    ImageWithFallback: ({ alt }) => (
        <div data-testid="inline-avatar">{alt}</div>
    ),
}));

jest.mock("../../CopyButton", () => ({
    __esModule: true,
    default: () => null,
}));

describe("InlineAssistantPayload inline user tool event", () => {
    beforeEach(() => {
        mockConvertMessageToMarkdown.mockClear();
    });

    it("renders injected user messages with lightweight user styling", () => {
        render(
            <InlineAssistantPayload
                items={[
                    JSON.stringify({
                        type: "tool_event",
                        callId: "status-1",
                        icon: "💬",
                        userMessage: "No you moved it to lanaclaw",
                        status: "completed",
                        presentation: "inline_user",
                    }),
                ]}
                message={{
                    sender: "assistant",
                    sentTime: "2026-03-11T00:00:00.000Z",
                }}
                currentUser={{
                    name: "Jane Doe",
                    initials: "JD",
                }}
            />,
        );

        expect(
            screen.getByText("No you moved it to lanaclaw"),
        ).toBeInTheDocument();
        expect(screen.getByText("JD")).toBeInTheDocument();
        expect(screen.queryByText("💬")).not.toBeInTheDocument();
    });

    it("renders named stop icons without leaking the icon name into text", () => {
        const { container } = render(
            <InlineAssistantPayload
                items={[
                    JSON.stringify({
                        type: "tool_event",
                        callId: "stopped-stream:chat-1",
                        icon: "stop",
                        userMessage: "Stopped waiting for the live response",
                        status: "completed",
                    }),
                ]}
                message={{
                    sender: "assistant",
                    sentTime: "2026-03-11T00:00:00.000Z",
                }}
            />,
        );

        expect(
            screen.getByText("Stopped waiting for the live response"),
        ).toBeInTheDocument();
        expect(screen.queryByText("stop")).not.toBeInTheDocument();
        expect(container).not.toHaveTextContent(
            "stopStopped waiting for the live response",
        );
    });

    it("toggles tool event errors from failed status icons", () => {
        const longError = `Error: ${"x".repeat(700)} tail-marker`;
        const { container } = render(
            <InlineAssistantPayload
                items={[
                    JSON.stringify({
                        type: "tool_event",
                        callId: "tool-error-1",
                        icon: "⚠️",
                        userMessage: "Tool failed",
                        status: "failed",
                        error: longError,
                    }),
                    JSON.stringify({
                        type: "tool_event",
                        callId: "tool-error-2",
                        icon: "⚠️",
                        userMessage: "Second tool failed",
                        status: "failed",
                        error: "Second error",
                    }),
                ]}
                message={{
                    sender: "assistant",
                    sentTime: "2026-03-11T00:00:00.000Z",
                }}
            />,
        );

        expect(screen.getByText("Tool failed")).toBeInTheDocument();
        expect(screen.getByText("Second tool failed")).toBeInTheDocument();
        expect(container).not.toHaveTextContent("tail-marker");
        expect(container).not.toHaveTextContent("Second error");
        expect(
            screen.queryByText("Show tool error details"),
        ).not.toBeInTheDocument();
        expect(
            screen.getAllByLabelText("Show tool error details"),
        ).toHaveLength(2);

        fireEvent.click(screen.getAllByLabelText("Show tool error details")[0]);

        expect(container).toHaveTextContent(longError);
        expect(
            screen.getByText("Second error", { exact: false }),
        ).toBeInTheDocument();
        expect(
            screen.queryByText("Hide tool error details"),
        ).not.toBeInTheDocument();
        expect(
            screen.getAllByLabelText("Hide tool error details"),
        ).toHaveLength(2);

        fireEvent.click(screen.getAllByLabelText("Hide tool error details")[1]);

        expect(container).not.toHaveTextContent("tail-marker");
        expect(container).not.toHaveTextContent("Second error");
    });

    it("shows an error icon when a completed tool event includes an error", () => {
        render(
            <InlineAssistantPayload
                items={[
                    JSON.stringify({
                        type: "tool_event",
                        callId: "legacy-tool-error-1",
                        icon: "⚠️",
                        userMessage: "Tool failed",
                        status: "completed",
                        error: "Legacy error",
                    }),
                ]}
                message={{
                    sender: "assistant",
                    sentTime: "2026-03-11T00:00:00.000Z",
                }}
            />,
        );

        expect(screen.getByText("Tool failed")).toBeInTheDocument();
        expect(
            screen.getByLabelText("Show tool error details"),
        ).toBeInTheDocument();
        expect(
            screen.queryByLabelText("Tool succeeded"),
        ).not.toBeInTheDocument();
        expect(screen.queryByText("Legacy error")).not.toBeInTheDocument();
    });

    it("toggles inline user tool event errors from the failed status icon", () => {
        const longError = `Error: ${"y".repeat(700)} tail-marker`;
        const { container } = render(
            <InlineAssistantPayload
                items={[
                    JSON.stringify({
                        type: "tool_event",
                        callId: "inline-tool-error-1",
                        icon: "💬",
                        userMessage: "No you moved it to lanaclaw",
                        status: "failed",
                        presentation: "inline_user",
                        error: longError,
                    }),
                ]}
                message={{
                    sender: "assistant",
                    sentTime: "2026-03-11T00:00:00.000Z",
                }}
                currentUser={{
                    name: "Jane Doe",
                    initials: "JD",
                }}
            />,
        );

        expect(
            screen.getByText("No you moved it to lanaclaw"),
        ).toBeInTheDocument();
        expect(container).not.toHaveTextContent("tail-marker");

        fireEvent.click(screen.getByLabelText("Show tool error details"));

        expect(container).toHaveTextContent(longError);
    });

    it.each([
        [
            "text payloads",
            {
                type: "text",
                text: "```mermaid\nflowchart TD\nA-->B\n```",
            },
        ],
        [
            "thinking text",
            {
                type: "thinking",
                text: "```mermaid\nflowchart TD\nA-->B\n```",
                duration: 4,
            },
        ],
    ])(
        "uses non-final markdown rendering while streaming %s",
        (_label, item) => {
            render(
                <InlineAssistantPayload
                    items={[JSON.stringify(item)]}
                    message={{
                        sender: "assistant",
                        sentTime: "2026-03-11T00:00:00.000Z",
                    }}
                    isStreaming={true}
                />,
            );

            expect(mockConvertMessageToMarkdown).toHaveBeenCalledWith(
                expect.objectContaining({
                    payload: "```mermaid\nflowchart TD\nA-->B\n```",
                }),
                false,
                undefined,
                undefined,
            );
        },
    );

    it("keeps the completed thinking summary visible at the end", () => {
        render(
            <InlineAssistantPayload
                items={[
                    JSON.stringify({
                        type: "text",
                        text: "Final answer",
                    }),
                    JSON.stringify({
                        type: "thinking",
                        text: "Private note",
                        duration: 4,
                    }),
                ]}
                message={{
                    sender: "assistant",
                    sentTime: "2026-03-11T00:00:00.000Z",
                }}
                isStreaming={false}
            />,
        );

        expect(screen.getByText("Thought for 4s")).toBeInTheDocument();

        const markdownBlocks = screen.getAllByTestId("markdown");
        expect(markdownBlocks[0]).toHaveTextContent("Final answer");
        expect(markdownBlocks[1]).toHaveTextContent("Private note");
    });

    it("hides summary-only completed thinking metadata", () => {
        render(
            <InlineAssistantPayload
                items={[
                    JSON.stringify({
                        type: "text",
                        text: "Final answer",
                    }),
                    JSON.stringify({
                        type: "thinking",
                        text: "",
                        duration: 4,
                    }),
                ]}
                message={{
                    sender: "assistant",
                    sentTime: "2026-03-11T00:00:00.000Z",
                }}
                isStreaming={false}
            />,
        );

        expect(screen.queryByText("Thought for 4s")).not.toBeInTheDocument();
        expect(screen.getByTestId("markdown")).toHaveTextContent(
            "Final answer",
        );
    });
});
