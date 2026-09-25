import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import TeamNotificationItem from "./TeamNotificationItem";
import en from "../../../config/default/locales/en.json";
jest.mock("../teams/TeamWisps", () => ({
    __esModule: true,
    default: () => <span />,
}));
jest.mock("../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({ direction: "rtl" }),
}));
jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) =>
            require("../../../config/default/locales/en.json")[key] || key,
    }),
}));
const t = (key, values = {}) =>
    (en[key] || key).replace(/{{(\w+)}}/g, (_, name) => values[name]);
const base = {
    _id: "root",
    read: false,
    notificationIds: ["n1", "n2"],
    team: {
        teamId: "root",
        title: "Playable game",
        coordinatorId: "assistant",
        chatId: "same-chat",
        state: "active",
        taskStatus: "waiting",
        members: [{ assistantId: "assistant", name: "Assistant" }],
        assignments: [
            {
                messageId: "q",
                from: "assistant",
                to: "user",
                status: "pending",
                request: "Which controls?",
            },
        ],
    },
};
it("opens team details by default and answers in the canonical chat with one grouped read action", () => {
    const push = jest.fn(),
        read = jest.fn(),
        dismiss = jest.fn();
    render(
        <TeamNotificationItem
            notification={base}
            router={{ push }}
            onMarkRead={read}
            handleDismiss={dismiss}
            t={t}
        />,
    );
    expect(screen.getByRole("article")).toHaveAttribute("dir", "rtl");
    fireEvent.click(screen.getByRole("link", { name: /Playable game/ }));
    expect(push).toHaveBeenLastCalledWith("/teams/root");
    expect(read).toHaveBeenLastCalledWith(["n1", "n2"]);
    fireEvent.click(screen.getByRole("link", { name: "Answer in chat" }));
    expect(push).toHaveBeenLastCalledWith("/chat/same-chat");
    expect(
        screen.queryByRole("button", { name: "Hide" }),
    ).not.toBeInTheDocument();
});
it("replaces resolved help with current state and puts completed results one click away", () => {
    const push = jest.fn();
    const { rerender } = render(
        <TeamNotificationItem notification={base} router={{ push }} t={t} />,
    );
    const done = {
        ...base,
        team: {
            ...base.team,
            taskStatus: "completed",
            state: "completed",
            assignments: [{ ...base.team.assignments[0], status: "answered" }],
        },
    };
    rerender(
        <TeamNotificationItem notification={done} router={{ push }} t={t} />,
    );
    expect(
        screen.queryByRole("link", { name: "Answer in chat" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "View results" }));
    expect(push).toHaveBeenLastCalledWith("/teams/root#result");
});

it("hides dismissed completed cards even in full notification history", () => {
    render(
        <TeamNotificationItem
            notification={{
                ...base,
                dismissed: true,
                team: {
                    ...base.team,
                    taskStatus: "completed",
                    state: "completed",
                },
            }}
            router={{ push: jest.fn() }}
            t={t}
        />,
    );
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
});
