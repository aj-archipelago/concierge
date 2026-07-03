import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import DigestBlock from "./DigestBlock";

jest.mock("next/navigation", () => ({
    __esModule: true,
    useRouter: () => ({
        push: jest.fn(),
    }),
}));

jest.mock("react-i18next", () => ({
    __esModule: true,
    useTranslation: () => ({
        t: (key, values) => values?.defaultValue || key,
    }),
}));

jest.mock("react-time-ago", () => ({
    __esModule: true,
    default: () => <span>just now</span>,
}));

jest.mock("../../../src/contexts/LanguageProvider", () => {
    const React = require("react");
    return {
        __esModule: true,
        LanguageContext: React.createContext({ language: "en" }),
    };
});

jest.mock("../../../src/components/chat/ChatMessage", () => ({
    __esModule: true,
    convertMessageToMarkdown: ({ payload }) => <div>{payload}</div>,
}));

jest.mock("../../../src/components/automations/AutomationHtmlFrame", () => ({
    __esModule: true,
    default: ({ automationId }) => (
        <div
            data-testid="automation-html-frame"
            data-automation-id={automationId}
        />
    ),
}));

jest.mock("../../components/loader", () => ({
    __esModule: true,
    default: () => <div data-testid="loader" />,
}));

jest.mock("../../queries/chats", () => ({
    __esModule: true,
    useAddChat: () => ({
        mutateAsync: jest.fn(),
    }),
}));

jest.mock("../../queries/digest", () => ({
    __esModule: true,
    useRegenerateDigestBlock: () => ({
        isPending: false,
        mutate: jest.fn(),
    }),
}));

jest.mock("../../queries/notifications", () => ({
    __esModule: true,
    useTask: () => ({ data: null }),
}));

describe("DigestBlock fullscreen", () => {
    it("opens prompt digest content from the fullscreen button", () => {
        render(
            <DigestBlock
                block={{
                    _id: "digest-1",
                    title: "Daily Digest",
                    prompt: "Summarize",
                    content: JSON.stringify({ payload: "Digest body" }),
                    updatedAt: "2026-06-16T00:00:00.000Z",
                }}
            />,
        );

        fireEvent.click(screen.getByTitle("Full screen"));

        const dialog = screen.getByRole("dialog", { name: "Daily Digest" });
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).getByText("Digest body")).toBeInTheDocument();
    });

    it("opens automation HTML output from the fullscreen button with automationId fallback", () => {
        render(
            <DigestBlock
                block={{
                    _id: "automation-block-1",
                    title: "Nightly Automation",
                    automationId: "automation-1",
                    automationRun: {
                        _id: "run-1",
                        taskId: "task-1",
                        status: "completed",
                        hasHtmlOutput: true,
                        completedAt: "2026-06-16T00:00:00.000Z",
                    },
                }}
            />,
        );

        fireEvent.click(screen.getByTitle("Full screen"));

        const dialog = screen.getByRole("dialog", {
            name: "Nightly Automation",
        });
        expect(dialog).toBeInTheDocument();
        expect(
            within(dialog).getByTestId("automation-html-frame"),
        ).toHaveAttribute("data-automation-id", "automation-1");
    });
});
