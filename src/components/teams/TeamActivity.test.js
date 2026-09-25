import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import ChatTeamActivity from "./ChatTeamActivity";
import TeamPage from "./TeamPage";
import TeamJobsList from "./TeamJobsList";
import AssistantTaskNotificationItem from "../notifications/AssistantTaskNotificationItem";
import { LanguageContext } from "../../contexts/LanguageProvider";
import {
    useAssistantTeams,
    useAssistantTeam,
} from "../../hooks/useAssistantTeams";
import en from "../../../config/default/locales/en.json";
jest.mock("./TeamConversationButton", () => ({
    __esModule: true,
    default: ({ chatId, label }) => (
        <button data-chat-id={chatId}>{label}</button>
    ),
}));
jest.mock("./TeamJobControls", () => ({
    __esModule: true,
    default: () => null,
}));
const translate = (key, values = {}) =>
    (en[key] || key).replace(/{{(\w+)}}/g, (_, name) => values[name]);
jest.mock("../../hooks/useAssistantTeams", () => ({
    useAssistantTeams: jest.fn(),
    useAssistantTeam: jest.fn(),
}));
jest.mock("../../hooks/useColleagues", () => ({
    useColleagues: () => ({ data: [{ id: "assistant", kind: "personal" }] }),
}));
jest.mock("../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({
        direction: "ltr",
        language: "en",
    }),
}));
jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key, values = {}) =>
            (
                require("../../../config/default/locales/en.json")[key] || key
            ).replace(/{{(\w+)}}/g, (_, name) => values[name]),
    }),
}));
jest.mock("../../layout/PageHeader", () => ({
    __esModule: true,
    default: ({ title, children }) => (
        <header>
            <h1>{title}</h1>
            {children}
        </header>
    ),
}));
jest.mock("../colleagues/ColleagueAvatar", () => ({
    __esModule: true,
    default: ({ entityId }) => <span data-testid={`wisp-${entityId}`} />,
    getEntityWispVariant: () => undefined,
}));
const team = {
    teamId: "team",
    title: "Build a game",
    goal: "Playable game",
    plan: "Build, review, deliver",
    taskStatus: "waiting",
    state: "active",
    coordinatorId: "assistant",
    chatId: "source",
    members: [
        { assistantId: "assistant", name: "Assistant", role: "Lead" },
        { assistantId: "pixel", name: "Pixel", role: "Developer" },
    ],
    assignments: [],
    acceptanceCriteria: ["Playable"],
    decisions: [],
    downloads: [],
};
const query = () => ({
    data: { pages: [{ teams: [team] }] },
    refetch: jest.fn(),
    fetchNextPage: jest.fn(),
    hasNextPage: false,
});
beforeEach(() => {
    jest.clearAllMocks();
    useAssistantTeams.mockReturnValue(query());
    useAssistantTeam.mockReturnValue({ data: team, refetch: jest.fn() });
});
it("shows the team as it is recruited and changes its status when an assignment starts", () => {
    const { rerender } = render(<ChatTeamActivity chatId="source" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/teams/team");
    expect(screen.getByTestId("wisp-pixel")).toBeInTheDocument();
    useAssistantTeams.mockReturnValue({
        ...query(),
        data: {
            pages: [
                {
                    teams: [
                        {
                            ...team,
                            assignments: [
                                {
                                    messageId: "m",
                                    from: "assistant",
                                    to: "pixel",
                                    status: "pending",
                                    executionStatus: "in_progress",
                                    purpose: "assignment",
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    });
    rerender(<ChatTeamActivity chatId="source" />);
    expect(screen.getByTestId("wisp-pixel")).toBeInTheDocument();
    expect(screen.getByText("Pixel working now")).toBeVisible();
    rerender(<ChatTeamActivity chatId="source" enabled={false} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
it("reports refresh failure without removing the team or pretending it is live", () => {
    useAssistantTeams.mockReturnValue({ ...query(), isError: true });
    render(<ChatTeamActivity chatId="source" />);
    expect(screen.getByRole("status")).toHaveTextContent("Updates paused");
});
it("shows roles, real question action, assignment detail and review outcome with RTL", () => {
    const request = {
        messageId: "m",
        from: "assistant",
        to: "pixel",
        status: "answered",
        purpose: "review",
        executionStatus: "completed",
        request: "Review game",
        result: {
            outcome: "needs_revision",
            summary: "Fix collision",
            evidence: ["Collision failed"],
        },
    };
    const question = {
        messageId: "q",
        from: "pixel",
        to: "user",
        status: "pending",
        purpose: "question",
        questionChatId: "question",
        request: "Which controls?",
    };
    useAssistantTeam.mockReturnValue({
        data: { ...team, assignments: [request, question] },
    });
    render(
        <LanguageContext.Provider value={{ direction: "rtl", language: "ar" }}>
            <TeamPage teamId="team" />
        </LanguageContext.Provider>,
    );
    expect(screen.getByRole("main")).toHaveAttribute("dir", "rtl");
    expect(
        screen.getByRole("button", { name: "Answer in chat" }),
    ).toHaveAttribute("data-chat-id", "source");
    expect(
        screen.getByRole("link", { name: "Open full chat" }),
    ).toHaveAttribute("href", "/chat/source");
    expect(screen.getAllByText("Changes requested").length).toBeGreaterThan(0);
    expect(screen.getByText("Fix collision")).toBeInTheDocument();
    expect(screen.getByText("Developer")).toBeVisible();
});
it("offers only the recorded reviewed downloads and no answered question action", () => {
    useAssistantTeam.mockReturnValue({
        data: {
            ...team,
            taskStatus: "completed",
            state: "completed",
            result: { summary: "Ready", evidence: [] },
            downloads: [
                {
                    name: "game.html",
                    url: "/api/assistant-teams/team/artifacts/0",
                },
            ],
            assignments: [
                {
                    messageId: "q",
                    to: "user",
                    status: "answered",
                    purpose: "question",
                    request: "Which controls?",
                    answer: "Keys",
                },
            ],
        },
    });
    render(<TeamPage teamId="team" />);
    expect(
        screen.queryByRole("link", { name: "Answer in chat" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "game.html" })).toHaveAttribute(
        "href",
        "/api/assistant-teams/team/artifacts/0",
    );
});
it("keeps useful navigation in unavailable and loading states", () => {
    useAssistantTeam.mockReturnValue({ isLoading: true });
    const { rerender } = render(<TeamPage teamId="team" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading team");
    useAssistantTeam.mockReturnValue({
        isError: true,
        error: { response: { status: 404 } },
        refetch: jest.fn(),
    });
    rerender(<TeamPage teamId="team" />);
    expect(screen.getByRole("alert")).toHaveTextContent("unavailable");
    expect(screen.getByRole("link", { name: "All tasks" })).toBeVisible();
});
it("filters the list by a team member and supports history pagination", () => {
    const q = { ...query(), hasNextPage: true };
    useAssistantTeams.mockReturnValue(q);
    const { rerender } = render(<TeamJobsList assigneeId="pixel" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/teams/team");
    fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "history" },
    });
    expect(useAssistantTeams).toHaveBeenLastCalledWith({ status: "history" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(q.fetchNextPage).toHaveBeenCalled();
    rerender(<TeamJobsList assigneeId="unknown" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeVisible();
});
it("makes both question and team reachable from a team notification", () => {
    const push = jest.fn();
    render(
        <AssistantTaskNotificationItem
            notification={{
                _id: "team",
                status: "waiting",
                assistantProgress: {
                    teamId: "team",
                    name: "Assistant",
                    chatId: "source",
                    waitingFor: [{ questionChatId: "question" }],
                },
            }}
            router={{ push }}
            t={translate}
        />,
    );
    fireEvent.click(screen.getByRole("button", { name: "View team" }));
    expect(push).toHaveBeenLastCalledWith("/teams/team");
    fireEvent.click(screen.getByRole("button", { name: "Answer question" }));
    expect(push).toHaveBeenLastCalledWith("/chat/question");
});

it("lets users switch between jobs without changing the conversation", () => {
    const second = { ...team, teamId: "second", title: "Write the article" };
    useAssistantTeams.mockReturnValue({
        ...query(),
        data: { pages: [{ teams: [team, second] }] },
    });
    render(<ChatTeamActivity chatId="source" />);
    fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "second" },
    });
    expect(screen.getByRole("link")).toHaveAttribute("href", "/teams/second");
});
it("puts the reviewed result before the roster", () => {
    useAssistantTeam.mockReturnValue({
        data: {
            ...team,
            taskStatus: "completed",
            state: "completed",
            result: { summary: "Reviewed game ready" },
        },
    });
    render(<TeamPage teamId="team" />);
    const result = screen.getByRole("region", { name: en["teams.result"] });
    expect(result).toBeInTheDocument();
    const people = screen.getByRole("region", { name: en["teams.people"] });
    expect(people).toBeInTheDocument();
    expect(
        result.compareDocumentPosition(people) &
            Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
});
