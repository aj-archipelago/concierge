import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import AutomationRunRoutePage from "./AutomationRunRoutePage";
import {
    useAutomation,
    useAutomationRuns,
    useRunAutomation,
} from "../../hooks/useAutomations";
jest.mock("../../hooks/useAutomations", () => ({
    useAutomation: jest.fn(),
    useAutomationRuns: jest.fn(),
    useRunAutomation: jest.fn(),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock("../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({
        direction: "rtl",
        language: "ar",
    }),
}));
jest.mock("./AutomationHtmlPage", () => () => <div>Rendered HTML</div>);
jest.mock("./AutomationTextRunPage", () => () => (
    <div>Run status and output</div>
));
const mutate = jest.fn();
beforeEach(() => {
    jest.clearAllMocks();
    useAutomation.mockReturnValue({
        data: { name: "Daily brief", producesHtml: true, readOnly: false },
    });
    useAutomationRuns.mockReturnValue({ data: { pages: [{ runs: [] }] } });
    useRunAutomation.mockReturnValue({ mutate });
});
it("shows a useful first-run state instead of requesting missing HTML", () => {
    render(<AutomationRunRoutePage automationId="task" taskId="latest" />);
    expect(screen.getByText("automations.waitingTitle")).toBeVisible();
    expect(screen.queryByText("Rendered HTML")).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
        "href",
        "/automations/task?edit=1",
    );
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    expect(mutate).toHaveBeenCalledTimes(1);
});
it("waits for run history before choosing a view", () => {
    useAutomationRuns.mockReturnValue({ isLoading: true });
    render(<AutomationRunRoutePage automationId="task" taskId="latest" />);
    expect(
        screen.queryByText("automations.waitingTitle"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Rendered HTML")).not.toBeInTheDocument();
});
it("shows a running first task and switches to HTML when output exists", () => {
    useAutomationRuns.mockReturnValue({
        data: { pages: [{ runs: [{ _id: "run", status: "in_progress" }] }] },
    });
    const { rerender } = render(
        <AutomationRunRoutePage automationId="task" taskId="latest" />,
    );
    expect(screen.getByText("Run status and output")).toBeVisible();
    useAutomationRuns.mockReturnValue({
        data: {
            pages: [
                {
                    runs: [
                        {
                            _id: "run",
                            status: "completed",
                            automation: { hasHtmlOutput: true },
                        },
                    ],
                },
            ],
        },
    });
    rerender(<AutomationRunRoutePage automationId="task" taskId="latest" />);
    expect(screen.getByText("Rendered HTML")).toBeVisible();
});
it("does not offer editing or running to a read-only viewer", () => {
    useAutomation.mockReturnValue({
        data: { name: "Shared", producesHtml: true, readOnly: true },
    });
    render(<AutomationRunRoutePage automationId="task" taskId="latest" />);
    expect(
        screen.queryByRole("button", { name: "Run now" }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByRole("link", { name: "Edit" }),
    ).not.toBeInTheDocument();
});
it("distinguishes a run-history error from an empty history", () => {
    useAutomationRuns.mockReturnValue({ isError: true, refetch: jest.fn() });
    render(<AutomationRunRoutePage automationId="task" taskId="latest" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
        "automations.runHistoryError",
    );
    expect(
        screen.queryByText("automations.waitingTitle"),
    ).not.toBeInTheDocument();
});
it("preserves direct HTML links to older runs outside the loaded history page", () => {
    render(<AutomationRunRoutePage automationId="task" taskId="older-run" />);
    expect(screen.getByText("Rendered HTML")).toBeVisible();
    expect(
        screen.queryByText("automations.waitingTitle"),
    ).not.toBeInTheDocument();
});
