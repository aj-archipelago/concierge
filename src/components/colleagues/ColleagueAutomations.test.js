import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ColleagueAutomations from "./ColleagueAutomations";

const mockReplace = jest.fn();
jest.mock("../teams/TeamJobsList", () => () => null);
jest.mock("../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({
        direction: "ltr",
        language: "en",
    }),
}));
jest.mock("./ColleagueMessages", () => () => null);
let mockSearch = "";
let mockPathname = "/colleagues";
jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockReplace }),
    usePathname: () => mockPathname,
    useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key, values) => (values?.name ? `${key} ${values.name}` : key),
    }),
}));
jest.mock("./ColleagueAvatar", () => ({
    __esModule: true,
    default: () => null,
    getEntityWispVariant: () => "orbit",
}));
jest.mock("../automations/AutomationResultsPanel", () => ({
    __esModule: true,
    default: ({ selectedId, onEdit }) => (
        <div data-testid="results">
            {selectedId}
            <button onClick={onEdit}>Edit result</button>
        </div>
    ),
}));
jest.mock("../automations/AutomationEditor", () => ({
    __esModule: true,
    default: ({ selectedId, onDone }) => (
        <div data-testid="editor">
            {selectedId}
            <button onClick={onDone}>Done</button>
        </div>
    ),
}));
jest.mock("../automations/CreateAutomationDialog", () => ({
    __esModule: true,
    default: ({ open, entityId, onCreated }) =>
        open ? (
            <div data-testid="create-assignee">
                {entityId}
                <button
                    onClick={() =>
                        onCreated({ _id: "created" }, { customize: true })
                    }
                >
                    Create test
                </button>
            </div>
        ) : null,
}));

const colleagues = [
    { id: "personal", name: "Assistant", kind: "personal", status: "active" },
    { id: "noor", name: "Noor", kind: "colleague", status: "active" },
    {
        id: "archive",
        name: "Archived analyst",
        kind: "colleague",
        status: "archived",
    },
];
const automations = [
    {
        _id: "personal-task",
        name: "Legacy brief",
        lastRunAt: "2026-09-14T10:00:00Z",
        enabled: true,
    },
    {
        _id: "read-task",
        name: "Already reviewed",
        entityId: "personal",
        lastRunAt: "2026-09-14T12:00:00Z",
    },
    {
        _id: "noor-task",
        name: "Noor report",
        entityId: "noor",
        lastRunAt: "2026-09-14T11:00:00Z",
        enabled: true,
    },
    { _id: "archived-task", name: "Old research", entityId: "archive" },
];
const markRead = jest.fn();
const props = {
    automations,
    colleagues,
    readReceipts: { "read-task": "2026-09-14T12:00:00Z" },
    lastViewedAt: null,
    markRead,
};
beforeEach(() => {
    jest.clearAllMocks();
    mockSearch = "";
    mockPathname = "/colleagues";
});

it("opens with recent work in time order and leaves reports closed and unread", () => {
    render(<ColleagueAutomations {...props} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Already reviewed");
    expect(rows[1]).toHaveTextContent("Noor report");
    expect(screen.queryByText("Old research")).not.toBeInTheDocument();
    expect(screen.queryByTestId("results")).not.toBeInTheDocument();
    expect(
        screen.getByRole("button", { name: /Legacy brief/ }),
    ).toHaveTextContent("Assistant");
    expect(markRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Noor report/ }));
    expect(mockReplace).toHaveBeenCalledWith(
        "/colleagues?view=recent&automation=noor-task",
        { scroll: false },
    );
});

it("filters personal tasks including legacy assignments", () => {
    mockSearch = "assignee=personal";
    render(<ColleagueAutomations {...props} view="tasks" />);
    expect(
        screen.getByRole("button", { name: /Legacy brief/ }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole("button", { name: /Already reviewed/ }),
    ).toBeInTheDocument();
    expect(
        screen.queryByRole("button", { name: /Noor report/ }),
    ).not.toBeInTheDocument();
});

it("opens one report separately and marks only that task read", () => {
    mockSearch = "automation=noor-task";
    render(<ColleagueAutomations {...props} />);
    expect(screen.getByTestId("results")).toHaveTextContent("noor-task");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(markRead).not.toHaveBeenCalled();
    fireEvent.click(
        screen.getByRole("button", { name: "colleagues.markResultRead" }),
    );
    expect(markRead).toHaveBeenCalledWith(automations[2]);
});

it("keeps tasks without runs and archived colleagues accessible in Tasks", () => {
    render(<ColleagueAutomations {...props} view="tasks" />);
    expect(
        screen.getByRole("button", { name: /Old research/ }),
    ).toHaveTextContent("Archived analyst");
    expect(screen.queryByTestId("results")).not.toBeInTheDocument();
});

it("preserves the legacy URL through editing and returns to the filtered list", () => {
    mockPathname = "/automations";
    mockSearch = "assignee=personal&automation=personal-task&edit=1";
    render(<ColleagueAutomations {...props} view="tasks" />);
    expect(screen.getByTestId("editor")).toHaveTextContent("personal-task");
    fireEvent.click(
        screen.getByRole("button", { name: "colleagues.backToTasks" }),
    );
    expect(mockReplace).toHaveBeenCalledWith(
        "/automations?assignee=personal&view=tasks",
        { scroll: false },
    );
});

it("does not open a different task for an unavailable deep link", () => {
    mockSearch = "automation=deleted-task&edit=1";
    render(<ColleagueAutomations {...props} />);
    expect(screen.queryByTestId("editor")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
        "colleagues.resultUnavailable",
    );
});

it("distinguishes a load error from an empty activity list", () => {
    render(
        <ColleagueAutomations
            {...props}
            automations={[]}
            error={new Error("offline")}
        />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
        "colleagues.resultsError",
    );
    expect(
        screen.queryByText("colleagues.recentEmpty"),
    ).not.toBeInTheDocument();
});
