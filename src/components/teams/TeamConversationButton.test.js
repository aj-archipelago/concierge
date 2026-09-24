import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TeamConversationButton from "./TeamConversationButton";
import { useSetActiveChatId } from "../../../app/queries/chats";
import { useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
jest.mock("../../../app/queries/chats", () => ({
    useSetActiveChatId: jest.fn(),
}));
jest.mock("next/navigation", () => ({
    useRouter: jest.fn(() => ({ push: jest.fn() })),
}));
jest.mock("react-redux", () => ({ useDispatch: jest.fn() }));
jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));
jest.mock("../../stores/chatSlice", () => ({
    setChatBoxPosition: (value) => ({ type: "dock", value }),
    focusChatInput: () => ({ type: "focus" }),
}));
it("activates the exact conversation before opening the dock", async () => {
    let finish;
    const activate = jest.fn(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const dispatch = jest.fn();
    useDispatch.mockReturnValue(dispatch);
    useSetActiveChatId.mockReturnValue({ mutateAsync: activate });
    render(
        <TeamConversationButton chatId="job-chat" label="Talk to Assistant" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Talk to Assistant" }));
    expect(activate).toHaveBeenCalledWith("job-chat");
    expect(dispatch).not.toHaveBeenCalled();
    finish();
    await waitFor(() =>
        expect(dispatch).toHaveBeenCalledWith({
            type: "dock",
            value: { position: "docked" },
        }),
    );
});
it("does not show an unrelated conversation when activation fails", async () => {
    const dispatch = jest.fn();
    useDispatch.mockReturnValue(dispatch);
    useSetActiveChatId.mockReturnValue({
        mutateAsync: jest.fn().mockRejectedValue(new Error("unavailable")),
    });
    render(
        <TeamConversationButton chatId="job-chat" label="Talk to Assistant" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Talk to Assistant" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
        "teams.chatOpenError",
    );
    expect(dispatch).not.toHaveBeenCalled();
});

it("opens the same chat full-screen on a phone", async () => {
    const previous = window.matchMedia;
    window.matchMedia = jest.fn(() => ({ matches: true }));
    const push = jest.fn(),
        dispatch = jest.fn();
    useRouter.mockReturnValue({ push });
    useDispatch.mockReturnValue(dispatch);
    useSetActiveChatId.mockReturnValue({
        mutateAsync: jest.fn().mockResolvedValue({ activeChatId: "job-chat" }),
    });
    try {
        render(
            <TeamConversationButton
                chatId="job-chat"
                label="Talk to Assistant"
            />,
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Talk to Assistant" }),
        );
        await waitFor(() =>
            expect(push).toHaveBeenCalledWith("/chat/job-chat"),
        );
        expect(dispatch).not.toHaveBeenCalled();
    } finally {
        window.matchMedia = previous;
    }
});
