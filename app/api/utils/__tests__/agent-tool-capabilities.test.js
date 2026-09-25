/** @jest-environment node */
import {
    issueAgentToolsToken,
    readAgentToolsToken,
    runAgentToolOnce,
    agentCapabilityKey,
    withAssistantDispatchLock,
} from "../agent-tool-capabilities.mjs";
import { getAgentToolUser, withAgentToolUser } from "../agent-tool-context.mjs";
jest.mock("../redis.mjs", () => ({
    getRedisConnection: () => {
        throw new Error("Unexpected real Redis");
    },
}));
function fakeRedis() {
    const values = new Map();
    return {
        values,
        eval: jest.fn(async (script, count, key, token) =>
            values.get(key) === token ? values.delete(key) : 0,
        ),
        get: jest.fn(async (key) => values.get(key)),
        set: jest.fn(async (key, value, ...options) => {
            if (options.includes("NX") && values.has(key)) return null;
            values.set(key, value);
            return "OK";
        }),
        del: jest.fn(async (key) => values.delete(key)),
    };
}
it("binds continuation turns and generates separate chat-turn anchors server-side", async () => {
    const redis = fakeRedis(),
        user = { _id: "owner", contextId: "context" };
    const token = await issueAgentToolsToken(user, "editor", redis, {
        taskId: "task",
        turn: 2,
    });
    expect(await readAgentToolsToken(token, redis)).toMatchObject({
        taskId: "task",
        turn: 2,
        entityId: "editor",
    });
    const chatToken = await issueAgentToolsToken(user, "editor", redis, {
        chatId: "chat",
    });
    const nextToken = await issueAgentToolsToken(user, "editor", redis, {
        chatId: "chat",
    });
    const first = await readAgentToolsToken(chatToken, redis);
    expect(first).toMatchObject({ chatId: "chat", anchor: true, turn: 0 });
    expect(first.taskId).not.toBe(
        (await readAgentToolsToken(nextToken, redis)).taskId,
    );
});
it("binds opaque, expiring capabilities to one user and entity", async () => {
    const redis = fakeRedis(),
        user = { _id: "owner", contextId: "context" };
    const token = await issueAgentToolsToken(user, "rowan", redis);
    expect(token).not.toContain("owner");
    expect(await readAgentToolsToken(token, redis)).toEqual({
        userId: "owner",
        contextId: "context",
        entityId: "rowan",
    });
    expect(redis.set.mock.calls[0].slice(-2)).toEqual(["EX", 1800]);
    redis.values.delete(agentCapabilityKey(token));
    expect(await readAgentToolsToken(token, redis)).toBeNull();
    expect(await readAgentToolsToken("bad")).toBeNull();
});
it("replays an identical tool call without duplicating a task mutation", async () => {
    const redis = fakeRedis(),
        action = jest.fn(async () =>
            Response.json({ id: "new-task" }, { status: 201 }),
        );
    const first = await runAgentToolOnce(
        "secret",
        "request:tool-1",
        action,
        redis,
    );
    const second = await runAgentToolOnce(
        "secret",
        "request:tool-1",
        action,
        redis,
    );
    expect(first.status).toBe(201);
    expect(await second.json()).toEqual({ id: "new-task" });
    expect(action).toHaveBeenCalledTimes(1);
});
it("keeps overlapping authenticated tool scopes isolated and clears them afterward", async () => {
    const output = await Promise.all(
        ["a", "b"].map((id) =>
            withAgentToolUser({ id }, async () => {
                await Promise.resolve();
                return getAgentToolUser().id;
            }),
        ),
    );
    expect(output).toEqual(["a", "b"]);
    expect(getAgentToolUser()).toBeUndefined();
});
it("rechecks a result completed between the first read and acquiring the lock", async () => {
    const redis = fakeRedis(),
        action = jest.fn();
    redis.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
            JSON.stringify({ status: 201, body: { id: "already-created" } }),
        );
    const response = await runAgentToolOnce(
        "secret",
        "request:tool-race",
        action,
        redis,
    );
    expect(await response.json()).toEqual({ id: "already-created" });
    expect(action).not.toHaveBeenCalled();
});
it("rejects a concurrent duplicate while the original call holds the lock", async () => {
    const redis = fakeRedis();
    let release;
    const action = jest.fn(
        () =>
            new Promise((resolve) => {
                release = () => resolve(Response.json({ id: "one" }));
            }),
    );
    const first = runAgentToolOnce(
        "secret",
        "request:concurrent",
        action,
        redis,
    );
    while (!release) await Promise.resolve();
    const duplicate = await runAgentToolOnce(
        "secret",
        "request:concurrent",
        action,
        redis,
    );
    expect(duplicate.status).toBe(409);
    expect(action).toHaveBeenCalledTimes(1);
    release();
    await first;
});

it("serializes separate chat-turn dispatches and releases only its own lease", async () => {
    const redis = fakeRedis();
    let finish;
    const first = withAssistantDispatchLock(
        "owner:assistant:chat",
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
        redis,
    );
    await Promise.resolve();
    const duplicate = jest.fn();
    await expect(
        withAssistantDispatchLock("owner:assistant:chat", duplicate, redis),
    ).rejects.toThrow("already being recorded");
    expect(duplicate).not.toHaveBeenCalled();
    const key = [...redis.values.keys()][0];
    redis.values.set(key, "new-holder");
    finish("done");
    expect(await first).toBe("done");
    expect(redis.values.get(key)).toBe("new-holder");
});

it("queues concurrent team writes behind the current lease without repeating their actions", async () => {
    const redis = fakeRedis();
    const order = [];
    let finish;
    const first = withAssistantDispatchLock(
        "team:owner:root",
        async () => {
            order.push("first");
            await new Promise((resolve) => {
                finish = resolve;
            });
            order.push("first-finished");
        },
        redis,
        { waitMs: 1000 },
    );
    await Promise.resolve();
    const second = withAssistantDispatchLock(
        "team:owner:root",
        async () => {
            order.push("second");
            return "saved";
        },
        redis,
        { waitMs: 1000 },
    );
    finish();
    await first;
    expect(await second).toBe("saved");
    expect(order).toEqual(["first", "first-finished", "second"]);
    expect(redis.values.size).toBe(0);
});
