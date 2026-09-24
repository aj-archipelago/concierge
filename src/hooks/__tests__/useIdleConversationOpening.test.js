import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import {
    useIdleConversationOpening,
    CONVERSATION_IDLE_MS,
} from "../useIdleConversationOpening";

let nextId = 0;
const originalFetch = global.fetch;
const advance = async (ms) =>
    act(async () => {
        await jest.advanceTimersByTimeAsync(ms);
    });
const event = (type) => act(() => window.dispatchEvent(new Event(type)));
const response = (data) => ({ ok: true, json: async () => data });

function setup(overrides = {}, wrapper) {
    const props = {
        chatId: `idle-test-${nextId++}`,
        entityId: "colleague-editor",
        createdAt: new Date().toISOString(),
        enabled: true,
        ready: true,
        hasIntent: false,
        language: "ar",
        inputRef: { current: { value: "", getClientRects: () => [{}] } },
        onStateChange: jest.fn(),
        onCommitted: jest.fn(),
        ...overrides,
    };
    const metrics = { renders: 0 };
    const view = renderHook(
        (options) => {
            metrics.renders++;
            useIdleConversationOpening(options);
        },
        { initialProps: props, wrapper },
    );
    return { ...view, props, metrics };
}

beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(document, "hasFocus").mockReturnValue(true);
    jest.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    Object.defineProperty(crypto, "randomUUID", {
        configurable: true,
        value: () => "test-opening-token-1234",
    });
    global.fetch = jest.fn(async (_url, options) =>
        response(
            JSON.parse(options.body).action === "prepare"
                ? { ready: true }
                : { committed: true },
        ),
    );
});
afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    global.fetch = originalFetch;
});

it("waits three idle seconds and commits once, including Strict Mode", async () => {
    const { props, unmount } = setup({}, ({ children }) => (
        <StrictMode>{children}</StrictMode>
    ));
    await advance(CONVERSATION_IDLE_MS - 1);
    expect(fetch).not.toHaveBeenCalled();
    await advance(1);
    expect(
        fetch.mock.calls.map(([, options]) => JSON.parse(options.body).action),
    ).toEqual(["prepare", "commit"]);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
        entityId: "colleague-editor",
        language: "ar",
    });
    expect(props.onCommitted).toHaveBeenCalledTimes(1);
    await advance(30_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    unmount();
});

it("postpones on pointer activity without rendering on every move", async () => {
    const { metrics, unmount } = setup();
    await advance(2500);
    for (let i = 0; i < 100; i++) event("pointermove");
    await advance(2500);
    expect(fetch).not.toHaveBeenCalled();
    expect(metrics.renders).toBe(1);
    await advance(500);
    expect(fetch).toHaveBeenCalledTimes(2);
    unmount();
});

it.each(["beforeinput", "paste", "compositionstart", "dragenter", "drop"])(
    "yields permanently after %s",
    async (type) => {
        const { unmount } = setup();
        await advance(1000);
        event(type);
        await advance(30_000);
        expect(fetch).not.toHaveBeenCalled();
        unmount();
    },
);

it("does not greet after a draft or upload is started and then cleared", async () => {
    const { props, rerender, unmount } = setup();
    rerender({ ...props, hasIntent: true });
    rerender(props);
    await advance(30_000);
    expect(fetch).not.toHaveBeenCalled();
    unmount();
});

it("waits for focus and visibility, then gives a fresh grace period", async () => {
    document.hasFocus.mockReturnValue(false);
    const { unmount } = setup();
    await advance(10_000);
    expect(fetch).not.toHaveBeenCalled();
    document.hasFocus.mockReturnValue(true);
    event("focus");
    await advance(2000);
    jest.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await advance(10_000);
    expect(fetch).not.toHaveBeenCalled();
    jest.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await advance(2999);
    expect(fetch).not.toHaveBeenCalled();
    await advance(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    unmount();
});

it("cancels generation if typing begins before the reply is ready", async () => {
    let resolvePreparation;
    fetch.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                resolvePreparation = resolve;
            }),
    );
    const { props, unmount } = setup();
    await advance(3000);
    const signal = fetch.mock.calls[0][1].signal;
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "H" })));
    await act(async () => resolvePreparation(response({ ready: true })));
    expect(signal.aborted).toBe(true);
    expect(
        fetch.mock.calls.map(([, options]) => JSON.parse(options.body).action),
    ).toEqual(["prepare", "cancel"]);
    expect(props.onCommitted).not.toHaveBeenCalled();
    expect(props.onStateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ busy: false }),
    );
    unmount();
});

it.each([
    { enabled: false },
    { ready: false },
    { createdAt: "2020-01-01" },
    { inputRef: { current: { value: "draft", getClientRects: () => [{}] } } },
])("does not open for ineligible state %j", async (options) => {
    const { unmount } = setup(options);
    await advance(30_000);
    expect(fetch).not.toHaveBeenCalled();
    unmount();
});

it("discards a pending opening on navigation and never retries it", async () => {
    fetch.mockImplementationOnce(() => new Promise(() => {}));
    const { props, unmount } = setup();
    await advance(3000);
    unmount();
    const second = setup(props);
    await advance(30_000);
    expect(
        fetch.mock.calls.map(([, options]) => JSON.parse(options.body).action),
    ).toEqual(["prepare", "cancel"]);
    second.unmount();
});

it("leaves the composer alone when generation fails", async () => {
    fetch.mockRejectedValueOnce(new Error("offline"));
    const { props, unmount } = setup();
    await advance(3000);
    await advance(30_000);
    expect(props.onCommitted).not.toHaveBeenCalled();
    expect(props.onStateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ busy: false }),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    unmount();
});
