import React, { useRef } from "react";
import { act, render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAssistantChatDelivery } from "../useAssistantChatDelivery";
import axios from "../../../app/utils/axios-client";

const mockMarkRead = jest.fn();
jest.mock("../../../app/utils/axios-client", () => ({ get: jest.fn() }));
jest.mock("../../../app/queries/notifications", () => ({
    useMarkNotificationsRead: () => ({ mutateAsync: mockMarkRead }),
}));
jest.mock("../../App", () => ({
    CurrentUserContext: require("react").createContext({ _id: "owner" }),
}));
const result = {
    id: "result-notice",
    messageId: "result-message",
    kind: "result",
};
const question = {
    id: "question-notice",
    messageId: "question-message",
    kind: "help",
};
let observers, client, deliveries;
const advance = (ms) =>
    act(async () => {
        await jest.advanceTimersByTimeAsync(ms);
    });
const event = (type) => act(() => window.dispatchEvent(new Event(type)));
const intersect = (element, visible = true) =>
    act(() => {
        for (const observer of [...observers]) {
            if (observer.targets.has(element))
                observer.callback([
                    {
                        target: element,
                        isIntersecting: visible,
                        intersectionRect: {
                            width: visible ? 300 : 0,
                            height: visible ? 100 : 0,
                        },
                    },
                ]);
        }
    });
function Harness({ messages = [{ _id: result.messageId }], ...props }) {
    const containerRef = useRef(null);
    useAssistantChatDelivery({
        containerRef,
        messages,
        chatId: "job-chat",
        ...props,
    });
    return (
        <div ref={containerRef} data-testid="surface">
            {messages.map((m) => (
                <div key={m._id} data-message-id={m._id} data-testid={m._id}>
                    Result
                </div>
            ))}
        </div>
    );
}
function setup(props = {}) {
    client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    jest.spyOn(client, "invalidateQueries").mockResolvedValue();
    const view = render(<Harness {...props} />, {
        wrapper: ({ children }) => (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        ),
    });
    screen.getByTestId("surface").getClientRects = () => [{}];
    return {
        ...view,
        rerender: (next) => view.rerender(<Harness {...props} {...next} />),
    };
}
async function watch() {
    intersect(screen.getByTestId("surface"));
    await advance(20);
}
beforeEach(() => {
    jest.useFakeTimers();
    observers = new Set();
    deliveries = [result];
    global.IntersectionObserver = class {
        targets = new Set();
        constructor(callback) {
            this.callback = callback;
            observers.add(this);
        }
        observe(target) {
            this.targets.add(target);
        }
        disconnect() {
            this.targets.clear();
            observers.delete(this);
        }
    };
    jest.spyOn(document, "hasFocus").mockReturnValue(true);
    jest.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    axios.get.mockReset().mockImplementation(async () => ({
        data: { deliveries: [...deliveries] },
    }));
    mockMarkRead.mockReset().mockImplementation(async ({ ids }) => {
        deliveries = deliveries.filter((d) => !ids.includes(d.id));
    });
});
afterEach(() => {
    cleanup();
    client?.clear();
    jest.restoreAllMocks();
    jest.useRealTimers();
    delete global.IntersectionObserver;
});

it("marks only the actually visible result read, keeping a question actionable", async () => {
    deliveries = [result, question];
    setup({
        messages: [{ _id: result.messageId }, { _id: question.messageId }],
    });
    await watch();
    expect(mockMarkRead).not.toHaveBeenCalled();
    intersect(screen.getByTestId(result.messageId));
    intersect(screen.getByTestId(question.messageId));
    await advance(350);
    expect(mockMarkRead).toHaveBeenCalledTimes(1);
    expect(mockMarkRead).toHaveBeenCalledWith({ ids: [result.id] });
    expect(deliveries).toEqual([question]);
});

it("does not fetch or acknowledge a hidden chat, shared view, or background tab", async () => {
    const view = setup({ enabled: false });
    await watch();
    expect(axios.get).not.toHaveBeenCalled();
    view.rerender({ enabled: true });
    await advance(20);
    expect(axios.get).not.toHaveBeenCalled();
    document.hasFocus.mockReturnValue(false);
    event("blur");
    await watch();
    expect(axios.get).not.toHaveBeenCalled();
    document.hasFocus.mockReturnValue(true);
    jest.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    event("focus");
    await advance(20);
    expect(axios.get).not.toHaveBeenCalled();
    expect(mockMarkRead).not.toHaveBeenCalled();
});

it("keeps a result unread while scrolled away, then acknowledges it when reached", async () => {
    setup();
    await watch();
    intersect(screen.getByTestId(result.messageId), false);
    await advance(500);
    expect(mockMarkRead).not.toHaveBeenCalled();
    intersect(screen.getByTestId(result.messageId));
    await advance(350);
    expect(mockMarkRead).toHaveBeenCalledWith({ ids: [result.id] });
});

it("cancels a pending acknowledgement on blur, hidden mobile canvas, or navigation", async () => {
    const view = setup();
    await watch();
    intersect(screen.getByTestId(result.messageId));
    document.hasFocus.mockReturnValue(false);
    event("blur");
    await advance(500);
    expect(mockMarkRead).not.toHaveBeenCalled();
    document.hasFocus.mockReturnValue(true);
    event("focus");
    await advance(20);
    intersect(screen.getByTestId(result.messageId));
    intersect(screen.getByTestId("surface"), false);
    await advance(500);
    expect(mockMarkRead).not.toHaveBeenCalled();
    await watch();
    intersect(screen.getByTestId(result.messageId));
    view.rerender({ chatId: "another-chat", messages: [] });
    await advance(500);
    expect(mockMarkRead).not.toHaveBeenCalled();
});

it("fetches missing messages for this chat without depending on inbox pagination", async () => {
    setup({ messages: [] });
    await watch();
    expect(axios.get).toHaveBeenCalledWith(
        "/api/chats/job-chat/deliveries",
        expect.any(Object),
    );
    expect(client.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(client.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["chat", "job-chat"],
        exact: true,
    });
    expect(mockMarkRead).not.toHaveBeenCalled();
});

it("waits until a foreground reply settles before refreshing or acknowledging", async () => {
    const view = setup({ busy: true, messages: [] });
    await watch();
    expect(client.invalidateQueries).not.toHaveBeenCalled();
    expect(mockMarkRead).not.toHaveBeenCalled();
    view.rerender({ busy: false, messages: [] });
    await advance(20);
    expect(client.invalidateQueries).toHaveBeenCalledTimes(1);
    view.rerender({ busy: false, messages: [{ _id: result.messageId }] });
    await advance(20);
    intersect(screen.getByTestId(result.messageId));
    await advance(350);
    expect(mockMarkRead).toHaveBeenCalledTimes(1);
});

it("retains unread status on receipt failure and retries after the next poll", async () => {
    mockMarkRead.mockRejectedValueOnce(new Error("offline"));
    setup();
    await watch();
    intersect(screen.getByTestId(result.messageId));
    await advance(350);
    expect(deliveries).toEqual([result]);
    await advance(5000);
    intersect(screen.getByTestId(result.messageId));
    await advance(350);
    expect(mockMarkRead).toHaveBeenCalledTimes(2);
    expect(deliveries).toEqual([]);
});

it("cancels observers and acknowledgement timers when the panel closes", async () => {
    const view = setup();
    await watch();
    intersect(screen.getByTestId(result.messageId));
    view.unmount();
    await advance(500);
    expect(mockMarkRead).not.toHaveBeenCalled();
    expect(observers.size).toBe(0);
});
