/** @jest-environment node */
import { POST } from "./route";
import Chat from "../../../models/chat.mjs";
import { requireColleague } from "../../../utils/colleagues.js";
import { appendChatMessage } from "../../message-store.js";
import { isSubscriptionStopped } from "../../_lib";
jest.mock("../../../utils/assistant-progress.mjs", () => ({
    assistantChatContext: jest.fn(async () => null),
}));
jest.mock("../../../utils/assistant-coordination.mjs", () => ({
    questionContext: jest.fn(async () => null),
}));

const mockChat = {
    _id: "chat-1",
    selectedEntityId: "entity-1",
    activeSubscriptionId: "run-1",
};
let mockObserver;
const mockUnsubscribe = jest.fn();
jest.mock("../../../models/chat.mjs", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
        findOneAndUpdate: jest.fn(),
        updateOne: jest.fn(),
    },
}));
jest.mock("../../../utils/auth", () => ({
    getCurrentUser: jest.fn(async () => ({
        _id: "user-1",
        contextId: "ctx-1",
    })),
    handleError: jest.fn((error) =>
        Response.json({ error: error.message }, { status: 500 }),
    ),
}));
jest.mock("../../../../../src/graphql", () => ({
    getClient: () => ({
        query: jest.fn(async () => ({
            data: { sys_entity_agent: { result: "run-1" } },
        })),
        subscribe: () => ({
            subscribe: (observer) => {
                mockObserver = observer;
                return { unsubscribe: mockUnsubscribe };
            },
        }),
    }),
    QUERIES: { SYS_ENTITY_AGENT: {}, SYS_GET_ENTITIES: {} },
    SUBSCRIPTIONS: { REQUEST_PROGRESS: {} },
}));
jest.mock("../../_lib", () => ({
    cleanupStaleStopRequestedIds: (ids) => ids,
    isSubscriptionStopped: jest.fn(() => false),
    removeStoppedSubscription: () => [],
    getEntrySubscriptionId: (entry) => entry,
    getChatForOwnerWrite: jest.fn(async () => ({ ok: true, chat: mockChat })),
}));
jest.mock("../../message-store.js", () => ({ appendChatMessage: jest.fn() }));
jest.mock("../../../utils/mcp-agent-config", () => ({
    buildMcpAgentConfigForUser: jest.fn(async () => ({})),
}));
jest.mock("../../../utils/agent-tool-capabilities.mjs", () => ({
    issueAgentToolsToken: jest.fn(async () => "synthetic-agent-capability"),
}));
jest.mock("../../../utils/colleagues.js", () => ({
    requireColleague: jest.fn(async () => ({
        id: "entity-1",
        status: "active",
    })),
}));
jest.mock("../../_lib/resolveChatEntitySelection", () => ({
    resolveChatEntitySelection: jest.fn(async () => ({
        entityId: "entity-1",
        persistedEntityId: "entity-1",
    })),
}));

const event = (progress) =>
    mockObserver.next({ data: { requestProgress: progress } });
const start = async () => {
    const response = await POST(
        new Request("http://localhost/api/chats/chat-1/stream", {
            method: "POST",
            body: JSON.stringify({
                conversation: [{ role: "user", content: "Write a report" }],
            }),
        }),
        { params: Promise.resolve({ id: "chat-1" }) },
    );
    expect(response.status).toBe(200);
    return response;
};
const eventsFrom = async (response) =>
    (await response.text())
        .trim()
        .split("\n\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line.slice(6)));

beforeEach(() => {
    jest.clearAllMocks();
    mockChat.activeSubscriptionId = "run-1";
    Chat.findOne.mockImplementation(async () => ({ ...mockChat }));
    Chat.findOneAndUpdate.mockResolvedValue(mockChat);
    Chat.updateOne.mockResolvedValue({ matchedCount: 1 });
    appendChatMessage.mockImplementation(async (_chat, message) => ({
        ...message,
        _id: "saved-1",
    }));
    isSubscriptionStopped.mockReturnValue(false);
});

test.each(["progress error", "transport error", "unexpected close"])(
    "preserves accumulated text after %s",
    async (terminal) => {
        const response = await start();
        await event({ data: JSON.stringify("A partial reply worth keeping") });
        if (terminal === "progress error")
            await event({ error: "Provider interrupted" });
        if (terminal === "transport error")
            await mockObserver.error(new Error("Connection lost"));
        if (terminal === "unexpected close") await mockObserver.complete();
        const events = await eventsFrom(response);
        expect(appendChatMessage).toHaveBeenCalledTimes(1);
        expect(
            JSON.stringify(appendChatMessage.mock.calls[0][1].payload),
        ).toContain("A partial reply worth keeping");
        expect(
            JSON.parse(appendChatMessage.mock.calls[0][1].tool).streamStatus,
        ).toBe("interrupted");
        expect(appendChatMessage.mock.calls[0][2]).toEqual({
            dedupeKey: "stream:run-1",
        });
        expect(events.at(-1).event).toBe("error");
        expect(events.at(-1).data.persisted).toBe(true);
        expect(events.some((e) => e.event === "complete")).toBe(false);
    },
);

test("keeps content included in the same terminal event as an error", async () => {
    const response = await start();
    await event({
        progress: 1,
        data: JSON.stringify("Final paragraph"),
        error: "One tool failed",
        info: JSON.stringify({
            clientSideTool: true,
            toolCallbackId: "late",
            ephemeral: false,
        }),
    });
    const events = await eventsFrom(response);
    expect(
        JSON.stringify(appendChatMessage.mock.calls[0][1].payload),
    ).toContain("Final paragraph");
    expect(
        events
            .filter((entry) => entry.event === "info")
            .some((entry) => JSON.parse(entry.data.info).clientSideTool),
    ).toBe(false);
});

test("reports a save failure instead of successful completion", async () => {
    appendChatMessage.mockRejectedValue(new Error("Database unavailable"));
    const response = await start();
    await event({ progress: 1, data: JSON.stringify("Unsaved reply") });
    const events = await eventsFrom(response);
    expect(events.at(-1)).toMatchObject({
        event: "error",
        data: { code: "CHAT_MESSAGE_SAVE_FAILED", persisted: false },
    });
    expect(events.some((e) => e.event === "complete")).toBe(false);
});

test("waits for persistence and finalizes only once across competing terminal signals", async () => {
    let resolveSave;
    appendChatMessage.mockImplementation(
        () =>
            new Promise((resolve) => {
                resolveSave = resolve;
            }),
    );
    const response = await start();
    const finishing = event({
        progress: 1,
        data: JSON.stringify("Complete reply"),
    });
    for (let attempt = 0; !resolveSave && attempt < 20; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(resolveSave).toEqual(expect.any(Function));
    const closed = mockObserver.complete();
    const repeated = event({ progress: 1, data: JSON.stringify("duplicate") });
    let streamClosed = false;
    const reading = eventsFrom(response).then((events) => {
        streamClosed = true;
        return events;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(streamClosed).toBe(false);
    resolveSave({ _id: "saved-1" });
    await Promise.all([finishing, closed, repeated]);
    expect((await reading).filter((e) => e.event === "complete")).toHaveLength(
        1,
    );
    expect(appendChatMessage).toHaveBeenCalledTimes(1);
});

test("keeps an explicitly stopped reply discarded and does not clear a newer run", async () => {
    const response = await start();
    mockChat.activeSubscriptionId = "run-2";
    isSubscriptionStopped.mockReturnValue(true);
    await event({ progress: 1, data: JSON.stringify("Stopped reply") });
    await eventsFrom(response);
    expect(appendChatMessage).not.toHaveBeenCalled();
    const terminalUpdates = [
        ...Chat.updateOne.mock.calls,
        ...Chat.findOneAndUpdate.mock.calls.slice(1),
    ];
    const loadingUpdates = terminalUpdates.filter(
        ([, update]) =>
            update.isChatLoading === false ||
            update.$set?.isChatLoading === false,
    );
    expect(loadingUpdates.length).toBeGreaterThan(0);
    for (const [filter] of loadingUpdates) {
        expect(filter.activeSubscriptionId).toBe("run-1");
    }
});

test("persists a partial reply even after the browser disconnects", async () => {
    const response = await start();
    await response.body.getReader().cancel();
    await event({ data: JSON.stringify("Background partial reply") });
    await mockObserver.error(new Error("Provider connection lost"));
    expect(appendChatMessage).toHaveBeenCalledTimes(1);
    expect(
        JSON.stringify(appendChatMessage.mock.calls[0][1].payload),
    ).toContain("Background partial reply");
});

test("keeps legacy deployment-default chats working when assistant management has no record", async () => {
    requireColleague.mockRejectedValueOnce(
        Object.assign(new Error("Colleague not found"), { status: 404 }),
    );
    const response = await start();
    await event({
        progress: 1,
        data: JSON.stringify("Reply from the deployment default"),
    });
    const events = await eventsFrom(response);
    expect(events.at(-1).event).toBe("complete");
    expect(requireColleague).toHaveBeenCalledWith(
        expect.objectContaining({ contextId: "ctx-1" }),
        "entity-1",
    );
});
