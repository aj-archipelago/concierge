import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import AssistantTaskNotificationItem from "./AssistantTaskNotificationItem";
import { LanguageContext } from "../../contexts/LanguageProvider";
import en from "../../../config/default/locales/en.json";
import ar from "../../../config/default/locales/ar.json";
jest.mock("../../contexts/LanguageProvider", () => ({
    LanguageContext: require("react").createContext({}),
}));
const task = {
    _id: "root",
    type: "assistant-run",
    status: "waiting",
    assistantProgress: {
        name: "Assistant",
        assistantId: "assistant",
        kind: "personal",
        title: "Review the article",
        chatId: "source",
        waitingFor: [{ assistantId: "reviewer", name: "Reviewer" }],
        requests: [
            {
                messageId: "request",
                name: "Reviewer",
                status: "in_progress",
                request: "Review draft.md",
            },
        ],
    },
};
function setup(notification = task, language = "en") {
    const props = {
        notification,
        router: { push: jest.fn() },
        setIsNotificationOpen: jest.fn(),
        handleCancelRequest: jest.fn(),
        t: (key, values = {}) =>
            (language === "en" ? en : ar)[key]?.replace(
                /{{(\w+)}}/g,
                (_, key) => values[key],
            ) || key,
    };
    const view = render(
        <LanguageContext.Provider
            value={{ direction: language === "en" ? "ltr" : "rtl" }}
        >
            <AssistantTaskNotificationItem {...props} />
        </LanguageContext.Provider>,
    );
    return { ...props, ...view };
}
it("names the sender and pending recipient, opens the source chat and offers a labelled stop action", () => {
    const props = setup();
    expect(screen.getByText("Assistant")).toBeVisible();
    expect(screen.getByText("Waiting for Reviewer")).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open chat" }));
    expect(props.router.push).toHaveBeenCalledWith("/chat/source");
    fireEvent.click(screen.getByRole("button", { name: "Stop task" }));
    expect(props.handleCancelRequest).toHaveBeenCalledWith("root");
    expect(screen.getByText("Assistants and requests").tagName).toBe("SUMMARY");
});
it("opens the pending question rather than a general conversation", () => {
    const props = setup({
        ...task,
        assistantProgress: {
            ...task.assistantProgress,
            waitingFor: [{ questionChatId: "question", assistantId: null }],
        },
    });
    fireEvent.click(screen.getByRole("button", { name: "Answer question" }));
    expect(props.router.push).toHaveBeenCalledWith("/chat/question");
});
it("renders Arabic status and logical layout", () => {
    setup(task, "ar");
    expect(screen.getByRole("article")).toHaveAttribute("dir", "rtl");
    expect(screen.getByText("بانتظار Reviewer")).toBeVisible();
    expect(screen.getByRole("button", { name: "فتح المحادثة" })).toBeVisible();
});
