import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { installHomeHistory } from "../../../app/home/components/__testUtils__/homeHistory";
import ColleaguesPage from "./ColleaguesPage";
import { useColleagues, useSaveColleague } from "../../hooks/useColleagues";
import {
    useAutomations,
    useAutomationReadReceipts,
} from "../../hooks/useAutomations";
import { useInbox } from "../../../app/queries/notifications";
import { LanguageContext } from "../../contexts/LanguageProvider";
import axios from "axios";
jest.mock("../teams/TeamJobsList", () => () => null);
jest.mock("../../../app/queries/modelMetadata", () => ({
    useAgentModels: () => ({ data: [] }),
    resolveAgentModelForSend: (value) => value,
}));
jest.mock("../../App", () => ({
    AuthContext: require("react").createContext({
        user: { contextId: "personal-memory" },
    }),
}));
jest.mock("../MemoryEditor", () => ({
    MemoryEditorContent: ({ user }) => (
        <div data-testid="memory-context">{user.contextId}</div>
    ),
}));
jest.mock("./AssistantResources", () => ({
    __esModule: true,
    default: () => <div data-testid="assistant-resources" />,
}));
jest.mock("./EntityOptions", () => ({
    __esModule: true,
    default: ({ entity }) => (
        <div data-testid="entity-options">{entity.id}</div>
    ),
}));
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockSearch = "view=team&entity=noor";
jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush, replace: mockReplace }),
    usePathname: () => "/colleagues",
    useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock("axios", () => ({ post: jest.fn() }));
jest.mock("../../hooks/useColleagues", () => ({
    useColleagues: jest.fn(),
    useSaveColleague: jest.fn(),
    useAssistant: (id) => ({
        data: require("../../hooks/useColleagues")
            .useColleagues()
            .data?.find((c) => c.id === id),
    }),
    useAssistantDirectory: () => {
        const result = require("../../hooks/useColleagues").useColleagues();
        return {
            ...result,
            data: {
                colleagues: result.data || [],
                total: result.data?.length || 0,
            },
        };
    },
}));
jest.mock("../../hooks/useAutomations", () => ({
    useAutomations: jest.fn(),
    useAutomationsLastViewedAt: () => ({ data: null }),
    useAutomationReadReceipts: jest.fn(),
}));
jest.mock("../../../app/queries/notifications", () => ({
    useInbox: jest.fn(),
}));
jest.mock("./ColleagueAutomations", () => ({
    __esModule: true,
    default: ({ automations }) => (
        <div data-testid="colleague-automations">
            {automations.map((task) => task.name).join(", ")}
        </div>
    ),
}));
jest.mock("../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({ direction: "ltr" }),
}));
jest.mock(
    "../automations/CreateAutomationDialog",
    () =>
        ({ open, entityId }) =>
            open ? <div data-testid="task-colleague">{entityId}</div> : null,
);
jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));
const mockSave = jest.fn();
const mockMarkRead = jest.fn();
const colleague = {
    id: "noor",
    kind: "colleague",
    isOwner: true,
    memoryContextId: "noor-private-memory",
    name: "Noor",
    description: "Research",
    instructions: "Check sources",
    status: "active",
    avatar: "orbit",
    directory: "/workspace/colleagues/noor",
};
beforeEach(() => {
    installHomeHistory("http://localhost/colleagues?view=team&entity=noor");
    jest.clearAllMocks();
    mockSearch = "view=team&entity=noor";
    useColleagues.mockReturnValue({ data: [colleague] });
    useSaveColleague.mockReturnValue({ mutateAsync: mockSave });
    useInbox.mockReturnValue({ data: { requests: [] } });
    useAutomationReadReceipts.mockReturnValue({
        data: {},
        markRead: mockMarkRead,
    });
    useAutomations.mockReturnValue({
        data: [
            { _id: "task", name: "Daily brief", entityId: "noor" },
            { _id: "other", name: "Other work", entityId: "other" },
        ],
    });
});
it("opens the team when there are no unread updates, even with existing tasks", () => {
    mockSearch = "";
    render(<ColleaguesPage />);
    expect(
        screen.getByRole("button", { name: "colleagues.team" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
        screen.getByRole("button", { name: /Noor.*Research/ }),
    ).toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith("/colleagues?view=team", {
        scroll: false,
    });
});

it("opens on reports when a task has an unread result, without clearing it", () => {
    useAutomations.mockReturnValue({
        data: [
            {
                _id: "task",
                name: "Daily brief",
                entityId: "noor",
                lastRunAt: "2026-09-14T12:00:00Z",
            },
        ],
    });
    mockSearch = "";
    render(<ColleaguesPage />);
    expect(screen.getByTestId("colleague-automations")).toHaveTextContent(
        "Daily brief",
    );
    expect(mockReplace).toHaveBeenCalledWith("/colleagues?view=recent", {
        scroll: false,
    });
    expect(mockMarkRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "colleagues.team" }));
    expect(mockPush).toHaveBeenCalledWith("/colleagues?view=team", {
        scroll: false,
    });
});

it("opens Recent for an unread colleague message without task results", () => {
    mockSearch = "";
    useInbox.mockReturnValue({
        data: { requests: [{ type: "colleague-message", read: false }] },
    });
    render(<ColleaguesPage />);
    expect(mockReplace).toHaveBeenCalledWith("/colleagues?view=recent", {
        scroll: false,
    });
    expect(
        screen.getByLabelText("colleagues.newUpdatesCount"),
    ).toHaveTextContent("1");
});

it("opens Team when results and colleague messages have already been read", () => {
    mockSearch = "";
    const lastRunAt = "2026-09-14T12:00:00Z";
    useAutomations.mockReturnValue({ data: [{ _id: "task", lastRunAt }] });
    useAutomationReadReceipts.mockReturnValue({
        data: { task: lastRunAt },
        markRead: mockMarkRead,
    });
    useInbox.mockReturnValue({
        data: {
            requests: [
                { type: "colleague-message", read: true },
                { type: "share-request", read: false },
            ],
        },
    });
    render(<ColleaguesPage />);
    expect(mockReplace).toHaveBeenCalledWith("/colleagues?view=team", {
        scroll: false,
    });
});

it.each(["tasks", "inbox"])(
    "waits for %s to load before choosing an empty landing view",
    (loadingSource) => {
        mockSearch = "";
        if (loadingSource === "tasks")
            useAutomations.mockReturnValue({ isLoading: true });
        else useInbox.mockReturnValue({ isLoading: true });
        const { rerender } = render(<ColleaguesPage />);
        expect(screen.getByRole("status")).toHaveTextContent("Loading...");
        expect(mockReplace).not.toHaveBeenCalled();
        useAutomations.mockReturnValue({ data: [] });
        useInbox.mockReturnValue({ data: { requests: [] } });
        rerender(<ColleaguesPage />);
        expect(mockReplace).toHaveBeenCalledWith("/colleagues?view=team", {
            scroll: false,
        });
    },
);

it.each(["recent", "tasks", "team"])(
    "keeps an explicit %s view while notifications change",
    (view) => {
        mockSearch = `view=${view}`;
        useInbox.mockReturnValue({
            data: { requests: [{ type: "colleague-message", read: false }] },
        });
        const { rerender } = render(<ColleaguesPage />);
        useInbox.mockReturnValue({ data: { requests: [] } });
        rerender(<ColleaguesPage />);
        expect(
            screen.getByRole("button", {
                name:
                    view === "tasks"
                        ? "colleagues.allTasks"
                        : `colleagues.${view}`,
            }),
        ).toHaveAttribute("aria-pressed", "true");
        expect(mockReplace).not.toHaveBeenCalled();
    },
);

it("opens a colleague task within the shared results view", () => {
    render(<ColleaguesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Daily brief/ }));
    expect(mockPush).toHaveBeenCalledWith(
        "/colleagues?view=tasks&entity=noor&assignee=noor&automation=task",
        { scroll: false },
    );
});
it("opens an archived colleague profile when navigating from a report in the same page", () => {
    useColleagues.mockReturnValue({
        data: [
            colleague,
            {
                ...colleague,
                id: "archived",
                name: "Archived analyst",
                status: "archived",
            },
        ],
    });
    mockSearch = "view=updates";
    const { rerender } = render(<ColleaguesPage />);
    mockSearch = "view=team&entity=archived&tab=tasks&archived=1";
    rerender(<ColleaguesPage />);
    expect(
        screen.getByRole("heading", { name: "Archived analyst" }),
    ).toBeInTheDocument();
    expect(
        screen.getByRole("button", { name: "colleagues.backToTeam" }),
    ).toBeInTheDocument();
});
it("shows only the selected colleague’s tasks and preserves RTL direction", () => {
    render(
        <LanguageContext.Provider value={{ direction: "rtl" }}>
            <ColleaguesPage />
        </LanguageContext.Provider>,
    );
    expect(screen.getByRole("main")).toHaveAttribute("dir", "rtl");
    expect(screen.getByText("Daily brief")).toBeInTheDocument();
    expect(screen.queryByText("Other work")).not.toBeInTheDocument();
});
it("opens normal chat targeted to the colleague", async () => {
    axios.post.mockResolvedValue({ data: { chatId: "thread" } });
    render(<ColleaguesPage />);
    fireEvent.click(screen.getByRole("button", { name: "colleagues.chat" }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/chat/thread"));
    expect(axios.post).toHaveBeenCalledWith("/api/colleagues/noor/chat", {});
});
it("pauses tasks without removing chat", async () => {
    mockSave.mockResolvedValue({ ...colleague, status: "paused" });
    render(<ColleaguesPage />);
    fireEvent.click(screen.getByRole("tab", { name: "colleagues.options" }));
    fireEvent.click(screen.getByRole("button", { name: "colleagues.pause" }));
    await waitFor(() =>
        expect(mockSave).toHaveBeenCalledWith({ id: "noor", status: "paused" }),
    );
    expect(
        screen.getByRole("button", { name: "colleagues.chat" }),
    ).toBeEnabled();
});
it("distinguishes a loading error from an empty team", () => {
    useColleagues.mockReturnValue({
        data: [],
        error: new Error("Unavailable"),
    });
    render(<ColleaguesPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("colleagues.error");
});

it("keeps personal controls on its own card and opens memory for the selected colleague", () => {
    useColleagues.mockReturnValue({
        data: [
            {
                ...colleague,
                id: "personal",
                kind: "personal",
                name: "Personal assistant",
            },
            colleague,
        ],
    });
    mockSearch = "view=team&entity=personal";
    const { rerender } = render(<ColleaguesPage />);
    expect(
        screen.getByRole("heading", { name: "Personal assistant" }),
    ).toBeInTheDocument();
    expect(
        screen.queryByRole("button", { name: "colleagues.archive" }),
    ).not.toBeInTheDocument();
    mockSearch = "view=team&entity=noor";
    rerender(<ColleaguesPage />);
    fireEvent.click(screen.getByRole("tab", { name: "colleagues.memory" }));
    expect(screen.getByTestId("memory-context")).toHaveTextContent(
        "noor-private-memory",
    );
    fireEvent.click(screen.getByRole("tab", { name: "colleagues.options" }));
    expect(screen.getByTestId("entity-options")).toHaveTextContent("noor");
});

it("opens Team as a directory without an automatic profile selection", () => {
    mockSearch = "view=team";
    render(<ColleaguesPage />);
    expect(
        screen.getByRole("button", { name: /Noor.*Research/ }),
    ).toBeInTheDocument();
    expect(
        screen.queryByRole("button", { name: "colleagues.chat" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Noor.*Research/ }));
    expect(mockPush).toHaveBeenCalledWith("/colleagues?view=team&entity=noor", {
        scroll: false,
    });
});

it("starts a new task with the colleague chosen in the task filter", () => {
    mockSearch = "view=tasks&assignee=noor";
    render(<ColleaguesPage />);
    fireEvent.click(
        screen.getByRole("button", { name: "colleagues.giveTask" }),
    );
    expect(screen.getByTestId("task-colleague")).toHaveTextContent("noor");
});

it("renders materials once and hides owner lifecycle controls from shared viewers", () => {
    mockSearch = "view=team&entity=noor&tab=materials";
    useColleagues.mockReturnValue({
        data: [
            {
                ...colleague,
                isOwner: false,
                editable: false,
                materialsContext: "applet-shared:bbbbbbbbbbbbbbbbbbbbbbbb",
            },
        ],
    });
    render(<ColleaguesPage />);
    expect(screen.getAllByTestId("assistant-resources")).toHaveLength(1);
    fireEvent.click(screen.getByRole("tab", { name: "colleagues.options" }));
    expect(
        screen.queryByRole("button", { name: "colleagues.pause" }),
    ).not.toBeInTheDocument();
    expect(
        screen.queryByRole("button", { name: "colleagues.archive" }),
    ).not.toBeInTheDocument();
});
