import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import StreamingMessage from "../StreamingMessage";

jest.mock("react-i18next", () => ({
    __esModule: true,
    useTranslation: () => ({
        t: (key, options) => {
            if (key === "Thinking with duration") {
                return `Thinking for ${options?.duration}s`;
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

jest.mock("../../../hooks/useStreamingMessages", () => ({
    useStreamingDisplay: jest.fn(),
}));

jest.mock("../BotMessage", () => ({
    __esModule: true,
    InlineAssistantPayload: ({ items }) => (
        <div data-testid="inline-payload">{items.length}</div>
    ),
}));

const { useStreamingDisplay } = require("../../../hooks/useStreamingMessages");

describe("StreamingMessage", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("renders the shell immediately without premature content blocks", () => {
        useStreamingDisplay.mockReturnValue({
            streamingContent: "",
            inlinePayloadItems: [],
            thinkingDuration: 0,
            isThinking: true,
        });

        render(<StreamingMessage chatId="chat-1" />);

        expect(screen.getByText("Thinking for 0s")).toBeInTheDocument();
        expect(screen.queryByTestId("inline-payload")).not.toBeInTheDocument();
    });

    it("renders the thinking footer once text starts streaming", () => {
        useStreamingDisplay.mockReturnValue({
            streamingContent: "Hello",
            inlinePayloadItems: [],
            thinkingDuration: 2,
            isThinking: true,
        });

        render(<StreamingMessage chatId="chat-1" />);

        expect(screen.getByText("Thinking for 2s")).toBeInTheDocument();
    });

    it("avoids a duplicate footer when a thinking item is already inline", () => {
        useStreamingDisplay.mockReturnValue({
            streamingContent: "",
            inlinePayloadItems: [
                JSON.stringify({
                    type: "thinking",
                    text: "Private note",
                    duration: 3,
                }),
            ],
            thinkingDuration: 3,
            isThinking: true,
        });

        render(<StreamingMessage chatId="chat-1" />);

        expect(screen.getByTestId("inline-payload")).toBeInTheDocument();
        expect(screen.queryByText("Thinking for 3s")).not.toBeInTheDocument();
    });
});
