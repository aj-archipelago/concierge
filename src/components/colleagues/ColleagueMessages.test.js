import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ColleagueMessages from "./ColleagueMessages";

const mockRead = jest.fn();
const messages = [
    {
        _id: "unread",
        type: "colleague-message",
        read: false,
        metadata: {
            entityId: "noor",
            name: "Noor",
            message: "Please review my report",
        },
    },
    {
        _id: "read",
        type: "colleague-message",
        read: true,
        metadata: { entityId: "noor", message: "Already seen" },
    },
    {
        _id: "other",
        type: "colleague-message",
        read: false,
        metadata: { entityId: "other", message: "Other colleague" },
    },
    {
        _id: "task",
        type: "automation-run",
        metadata: { message: "Task notification" },
    },
];
jest.mock("../../App", () => ({
    AuthContext: require("react").createContext({ user: {} }),
}));
jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("next/link", () => ({
    __esModule: true,
    default: ({ children, ...props }) => <a {...props}>{children}</a>,
}));
jest.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key) => key }),
}));
jest.mock("../../../app/queries/notifications", () => ({
    useInbox: () => ({ data: { requests: messages } }),
    useMarkNotificationsRead: () => ({ mutate: mockRead }),
}));
jest.mock("../notifications/ColleagueNotificationItem", () => ({
    __esModule: true,
    resolveNotificationCompanion: () => ({ name: "Noor" }),
    default: ({ notification, onMarkRead }) => (
        <button onClick={() => onMarkRead(notification._id)}>
            {notification.metadata.message}
        </button>
    ),
}));

it("surfaces unread colleague messages and marks only the opened message read", () => {
    render(<ColleagueMessages colleagues={[]} assigneeId="noor" />);
    expect(screen.queryByText("Already seen")).not.toBeInTheDocument();
    expect(screen.queryByText("Other colleague")).not.toBeInTheDocument();
    expect(screen.queryByText("Task notification")).not.toBeInTheDocument();
    expect(mockRead).not.toHaveBeenCalled();
    fireEvent.click(
        screen.getByRole("button", { name: "Please review my report" }),
    );
    expect(mockRead).toHaveBeenCalledWith({ ids: ["unread"] });
    expect(
        screen.getByRole("link", { name: "All notifications" }),
    ).toHaveAttribute("href", "/notifications");
});
