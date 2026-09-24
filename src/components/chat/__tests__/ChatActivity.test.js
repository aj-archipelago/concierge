import React from "react";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
    ChatActivityProvider,
    useChatActivity,
    resolveChatActivity,
    streamActivity,
} from "../ChatActivity";

jest.mock("../EntityIcon", () => () => null);

it("follows actual text and reasoning chunks, including a return to thinking", () => {
    expect(streamActivity({ isStreaming: true, isThinking: true }, "a")).toBe(
        "thinking",
    );
    expect(
        streamActivity(
            { isStreaming: true, isThinking: true, streamingContent: "Hello" },
            "a",
        ),
    ).toBe("replying");
    expect(
        streamActivity(
            {
                isStreaming: true,
                streamingContent: "Hello",
                currentResultIsEphemeral: true,
            },
            "a",
        ),
    ).toBe("thinking");
});

it("returns to focused motion while an agent tool is working", () => {
    expect(
        streamActivity(
            {
                isStreaming: true,
                streamingContent: "Checking",
                inlinePayloadItems: [
                    JSON.stringify({ type: "tool_event", status: "thinking" }),
                ],
            },
            "a",
        ),
    ).toBe("thinking");
});

it("prioritizes confirmations and explicit outcomes over stale loading flags", () => {
    expect(
        resolveChatActivity({ attention: true, busy: true }, "replying"),
    ).toBe("attention");
    expect(
        resolveChatActivity({ outcome: "done", busy: true }, "replying"),
    ).toBe("done");
    expect(resolveChatActivity({ outcome: "error", busy: true })).toBe("error");
    expect(resolveChatActivity({ outcome: "stopped", busy: true })).toBe(
        "idle",
    );
    expect(resolveChatActivity({ drafting: true })).toBe("interested");
});

it("keeps another colleague's stream from animating the current portrait", () => {
    expect(streamActivity({ isStreaming: true, entityId: "a" }, "b")).toBe(
        "elsewhere",
    );
    expect(resolveChatActivity({ busy: true }, "elsewhere")).toBe("idle");
});

it("ignores old-chat callbacks and avoids rendering the portrait for every text chunk", async () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    let report;
    let paintCount = 0;
    function Portrait() {
        const context = useChatActivity();
        report = context.report;
        paintCount++;
        return <output>{context.activity.phase}</output>;
    }
    const tree = (chatId) => (
        <QueryClientProvider client={client}>
            <ChatActivityProvider chatId={chatId} entityId="a">
                <Portrait />
            </ChatActivityProvider>
        </QueryClientProvider>
    );
    const { rerender, unmount } = render(tree("first"));
    const oldReport = report;
    act(() => report({ drafting: true }));
    expect(screen.getByText("interested")).toBeTruthy();
    rerender(tree("second"));
    act(() => oldReport({ outcome: "done" }));
    expect(screen.getByText("idle")).toBeTruthy();
    act(() =>
        client.setQueryData(["stream", "second"], {
            isStreaming: true,
            entityId: "a",
            streamingContent: "Hi",
        }),
    );
    await screen.findByText("replying");
    const baselinePaintCount = paintCount;
    await act(async () => {
        for (let i = 0; i < 30; i++)
            client.setQueryData(["stream", "second"], {
                isStreaming: true,
                entityId: "a",
                streamingContent: `Hi ${i}`,
            });
        await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(paintCount).toBe(baselinePaintCount);
    unmount();
    client.clear();
});
