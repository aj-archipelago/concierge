import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import AutomationResultsPanel from "./AutomationResultsPanel";
import { renderChatMarkdownMessage } from "../chat/chatMarkdownRenderer";

const mockMutate = jest.fn();

jest.mock("../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({ direction: "ltr" }),
}));

jest.mock("../chat/chatMarkdownRenderer", () => ({
    renderChatMarkdownMessage: jest.fn(({ message }) => (
        <div>{message.payload}</div>
    )),
}));

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("@/components/share/ShareButton", () => ({
    __esModule: true,
    default: function MockShareButton() {
        return <button type="button">Share</button>;
    },
}));

jest.mock("./AutomationHtmlFrame", () => ({
    __esModule: true,
    default: function MockAutomationHtmlFrame({ automationId, taskId }) {
        return (
            <div data-testid="automation-html-frame">
                {automationId}:{taskId}
            </div>
        );
    },
}));

const automation = {
    _id: "auto-1",
    slug: "daily-digest",
    name: "Daily digest",
    enabled: true,
    isOwner: true,
    readOnly: false,
    lastRunAt: "2026-08-04T12:00:00.000Z",
    nextRunAt: "2026-08-05T12:00:00.000Z",
};

let mockRuns = [];

jest.mock("../../hooks/useAutomations", () => ({
    useAutomation: () => ({ data: automation, isLoading: false }),
    useAutomationRuns: () => ({
        data: { pages: [{ runs: mockRuns }] },
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: jest.fn(),
    }),
    useRunAutomation: () => ({
        mutate: mockMutate,
        isPending: false,
    }),
}));

describe("AutomationResultsPanel", () => {
    beforeEach(() => {
        mockMutate.mockClear();
        mockRuns = [];
        renderChatMarkdownMessage.mockClear();
    });

    it("explains waiting and prevents another run while replies are outstanding", () => {
        mockRuns = [
            {
                _id: "waiting-run",
                status: "waiting",
                createdAt: new Date().toISOString(),
            },
        ];
        render(<AutomationResultsPanel automationId="auto-1" />);
        expect(screen.getByRole("button", { name: "Run now" })).toBeDisabled();
        expect(screen.getByRole("status")).toHaveTextContent(
            "colleagues.waitingForReplies",
        );
        expect(
            screen.getByRole("link", { name: "colleagues.openQuestions" }),
        ).toHaveAttribute("href", "/notifications");
    });

    it("keeps citation metadata when rendering a written result", () => {
        const tool = JSON.stringify({
            citations: [{ searchResultId: "id", url: "https://example.com" }],
        });
        mockRuns = [
            {
                _id: "run",
                status: "completed",
                data: { summary: "Claim :cd_source[id]", tool },
            },
        ];
        render(<AutomationResultsPanel selectedId="auto-1" />);
        expect(renderChatMarkdownMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                message: { payload: "Claim :cd_source[id]", tool },
            }),
        );
    });

    it("embeds latest HTML output and keeps recent runs behind a toggle", () => {
        mockRuns = [
            {
                _id: "run-html-1",
                status: "completed",
                createdAt: "2026-08-04T12:00:00.000Z",
                automation: {
                    hasHtmlOutput: true,
                    htmlOutputPath: "/tmp/out.html",
                    htmlOutputPreview: "<h1>Digest</h1>",
                },
                data: { summary: "Daily digest ready" },
            },
        ];

        const onEdit = jest.fn();
        render(<AutomationResultsPanel selectedId="auto-1" onEdit={onEdit} />);

        expect(screen.getByText("Daily digest")).toBeInTheDocument();
        expect(screen.getByTestId("automation-html-frame")).toHaveTextContent(
            "daily-digest:run-html-1",
        );
        expect(
            screen.getByRole("link", { name: /Open full page/i }),
        ).toHaveAttribute("href", "/automations/daily-digest/runs/run-html-1");
        // History stays out of the report until requested.
        expect(
            screen.queryByText("Daily digest ready"),
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId("automation-recent-runs-toggle"));
        expect(screen.getByText("Daily digest ready")).toBeInTheDocument();

        fireEvent.click(screen.getByTestId("automation-edit-button"));
        expect(onEdit).toHaveBeenCalledTimes(1);
    });

    it("shows text output when the latest run has no HTML", () => {
        mockRuns = [
            {
                _id: "run-text-1",
                status: "completed",
                createdAt: "2026-08-04T11:00:00.000Z",
                data: { summary: "Plain text summary from the run" },
            },
        ];

        render(
            <AutomationResultsPanel selectedId="auto-1" onEdit={jest.fn()} />,
        );

        expect(
            screen.queryByTestId("automation-html-frame"),
        ).not.toBeInTheDocument();
        expect(
            screen.getAllByText("Plain text summary from the run").length,
        ).toBeGreaterThan(0);
        expect(
            screen.getAllByRole("link", { name: /View details/i })[0],
        ).toHaveAttribute("href", "/automations/daily-digest/runs/run-text-1");
    });

    it("keeps a failed run's stack trace inside collapsed technical details", () => {
        const failure =
            "ApolloError: Received status code 400 at file:///app/worker.js:40:28";
        mockRuns = [{ _id: "failed", status: "failed", statusText: failure }];
        render(<AutomationResultsPanel selectedId="auto-1" />);

        expect(
            screen.getByRole("region", { name: "colleagues.taskFailedTitle" }),
        ).toBeVisible();
        expect(screen.getByText(failure)).not.toBeVisible();
        expect(renderChatMarkdownMessage).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Run now" })).toBeEnabled();

        fireEvent.click(screen.getByTestId("automation-recent-runs-toggle"));
        expect(screen.getAllByText("colleagues.taskFailedTitle")).toHaveLength(
            2,
        );
        expect(screen.getAllByText(failure)).toHaveLength(1);
        expect(screen.getByText(failure)).not.toBeVisible();
    });

    it("labels a previous report when the latest attempt failed", () => {
        mockRuns = [
            {
                _id: "failed",
                status: "failed",
                statusText: "Service unavailable",
                automation: { hasHtmlOutput: true },
            },
            {
                _id: "last-good",
                status: "completed",
                automation: { hasHtmlOutput: true },
            },
        ];
        render(<AutomationResultsPanel selectedId="auto-1" />);
        expect(
            screen.getByText("colleagues.showingPreviousReport"),
        ).toBeVisible();
        expect(screen.getByTestId("automation-html-frame")).toHaveTextContent(
            "daily-digest:last-good",
        );
    });
});
