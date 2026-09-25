import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import ColleagueNotificationItem from "./ColleagueNotificationItem";
jest.mock("react-time-ago", () => () => <span>just now</span>);

const notification = {
    _id: "notice",
    read: false,
    type: "colleague-message",
    createdAt: new Date().toISOString(),
    metadata: {
        entityId: "personal",
        name: "Assistant",
        entityKind: "personal",
        message: "Your report is ready.",
        chatId: "thread",
    },
};
const setup = (metadata = {}) => {
    const props = {
        notification: {
            ...notification,
            metadata: { ...notification.metadata, ...metadata },
        },
        router: { push: jest.fn() },
        setIsNotificationOpen: jest.fn(),
        onMarkRead: jest.fn(),
        handleDismiss: jest.fn(),
        dismissingIds: new Set(),
        t: (key) => key,
    };
    const view = render(<ColleagueNotificationItem {...props} />);
    return { ...props, ...view };
};
it("shows the personal gold Wisp and opens the companion chat from the message", () => {
    const { container, router, onMarkRead } = setup();
    expect(
        // eslint-disable-next-line testing-library/no-node-access -- The decorative Wisp is intentionally hidden from accessibility queries.
        container.querySelector('[data-wisp-variant="personal"]'),
    ).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/chat/thread");
    fireEvent.click(screen.getByText("Your report is ready."));
    expect(router.push).toHaveBeenCalledWith("/chat/thread");
    expect(onMarkRead).toHaveBeenCalledWith("notice");
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
});
it("uses the supplied result destination and keeps dismiss separate", () => {
    const { router, handleDismiss } = setup({
        url: "/automations/task/runs/result",
    });
    expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "/automations/task/runs/result",
    );
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(handleDismiss).toHaveBeenCalledWith("notice", "notification");
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link"));
    expect(router.push).toHaveBeenCalledWith("/automations/task/runs/result");
});
it("provides a normal external link and a clear help request", () => {
    setup({ url: "https://example.com/report", kind: "help" });
    expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "https://example.com/report",
    );
    expect(screen.getByText("colleagues.helpRequested")).toBeInTheDocument();
});
