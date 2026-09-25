import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import AutomationSharedPage from "./AutomationSharedPage";
import { useAutomation } from "../../hooks/useAutomations";
const mockReplace = jest.fn();
let mockQuery = "";
jest.mock("next/navigation", () => ({
    useRouter: () => ({ replace: mockReplace }),
    useSearchParams: () => new URLSearchParams(mockQuery),
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k) => k }) }));
jest.mock("../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({ direction: "ltr" }),
}));
jest.mock("../../hooks/useAutomations", () => ({
    useAutomation: jest.fn(),
    useAutomationRuns: () => ({ data: { pages: [] } }),
}));
jest.mock("./AutomationEditor", () => () => <div>Task editor</div>);
jest.mock("./RunHistory", () => () => null);
beforeEach(() => {
    mockReplace.mockClear();
    mockQuery = "";
    useAutomation.mockReturnValue({
        data: { name: "Test", producesHtml: true, readOnly: false },
    });
});
it("keeps the edit link in the editor for an HTML task that has never run", () => {
    mockQuery = "edit=1";
    render(<AutomationSharedPage automationId="task" />);
    expect(screen.getByText("Task editor")).toBeVisible();
    expect(mockReplace).not.toHaveBeenCalled();
});
it("preserves the normal result link for HTML tasks", () => {
    render(<AutomationSharedPage automationId="task" />);
    expect(mockReplace).toHaveBeenCalledWith("/automations/task/runs/latest");
});
