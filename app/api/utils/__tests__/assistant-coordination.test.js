/** @jest-environment node */
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Task from "../../models/task.mjs";
import Chat from "../../models/chat.mjs";
import Notification from "../../models/notification.mjs";
import AssistantMessage from "../../models/assistant-message.mjs";
import User from "../../models/user.mjs";
import {
    createBackgroundTask,
    enqueueAssistantContinuation,
} from "../tasks.js";
import { getTaskLiveState } from "../task-liveness.mjs";
import {
    requireColleague,
    listColleagues,
    searchColleagues,
} from "../colleagues.js";
import { consolidateQuestionConversation } from "../assistant-conversation.mjs";
import {
    publishColleagueMessage,
    getAssistantConversation,
} from "../colleague-chat.js";
import {
    readChatMessages,
    appendChatMessage,
} from "../../chats/message-store.js";
import {
    executeCoordinationTool,
    prepareAssistantTurn,
    parkAssistantTurn,
    questionContext,
    reconcileAssistantMessages,
} from "../assistant-coordination.mjs";
import {
    assistantChatContext,
    assistantAssignmentContext,
    readAssistantTasks,
    enrichAssistantTasks,
    VISIBLE_ASSISTANT_TASK_FILTER,
} from "../assistant-progress.mjs";
import assistantRun from "../../../../jobs/tasks/assistant-run.mjs";
import {
    issueAgentToolsToken,
    withAssistantDispatchLock,
} from "../agent-tool-capabilities.mjs";
jest.mock("../agent-tool-capabilities.mjs", () => ({
    issueAgentToolsToken: jest.fn(async () => "bound-token"),
    withAssistantDispatchLock: jest.fn(async (scope, action) => action()),
}));
jest.mock("../mcp-agent-config.js", () => ({
    buildMcpAgentConfigForUser: jest.fn(async () => ({
        mcpConfig: "{}",
        mcpAvailableServers: "[]",
    })),
}));
jest.mock("../../../../jobs/graphql.mjs", () => ({
    QUERIES: { SYS_ENTITY_AGENT: "agent-query" },
}));

jest.mock("../tasks.js", () => ({
    createBackgroundTask: jest.fn(),
    enqueueAssistantContinuation: jest.fn(),
}));
jest.mock("../task-liveness.mjs", () => ({ getTaskLiveState: jest.fn() }));
jest.mock("../colleagues.js", () => ({
    requireColleague: jest.fn(),
    listColleagues: jest.fn(),
    searchColleagues: jest.fn(),
    colleagueRequest: jest.fn(),
}));
jest.mock("../../models/user.mjs", () => ({
    __esModule: true,
    default: { findById: jest.fn() },
}));
let mongo, user, source;
const entities = ["editor", "researcher", "reviewer"].map((id) => ({
    id,
    name: id,
    status: "active",
    kind: "colleague",
}));
const checkpoint =
    "Draft saved at /workspace/article-v1.md. Await reviews, then edit v2. Human approval is required before publication.";
const entity = entities[0];
const binding = () => ({
    taskId: String(source._id),
    turn: source.assistantTurn,
});
const call = (tool, args, extras = {}) =>
    executeCoordinationTool({
        user,
        entity,
        binding: binding(),
        operationId: "operation-1",
        tool,
        args,
        ...extras,
    });
beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await mongoose.connect(mongo.getUri());
}, 60000);
afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
});
beforeEach(async () => {
    await Promise.all(
        Object.values(mongoose.connection.collections).map((c) =>
            c.deleteMany({}),
        ),
    );
    jest.clearAllMocks();
    user = {
        _id: new mongoose.Types.ObjectId(),
        contextId: "owner-context",
        personalEntityId: "editor",
    };
    User.findById.mockImplementation(async (id) =>
        String(id) === String(user._id) ? user : null,
    );
    requireColleague.mockImplementation(async (u, id) => {
        const e = entities.find((a) => a.id === id);
        if (!u || String(u._id) !== String(user._id) || !e)
            throw Object.assign(new Error("Assistant unavailable"), {
                status: 404,
            });
        return e;
    });
    listColleagues.mockResolvedValue(entities);
    searchColleagues.mockResolvedValue({
        colleagues: entities,
        nextOffset: null,
        total: entities.length,
    });
    getTaskLiveState.mockResolvedValue(null);
    createBackgroundTask.mockImplementation(
        async ({
            userId,
            type,
            metadata,
            idempotencyKey,
            assistantRouting,
        }) => {
            const id = createHash("sha256")
                .update(idempotencyKey)
                .digest("hex")
                .slice(0, 24);
            await Task.updateOne(
                { _id: id },
                {
                    $setOnInsert: {
                        owner: userId,
                        type,
                        metadata,
                        status: "pending",
                        ...(assistantRouting
                            ? {
                                  assistantEntityId: assistantRouting.entityId,
                                  assistantRootId: assistantRouting.rootId,
                                  assistantDepth: assistantRouting.depth,
                              }
                            : {}),
                    },
                },
                { upsert: true },
            );
            return { taskId: id };
        },
    );
    source = await Task.create({
        owner: user._id,
        type: "automation-run",
        status: "in_progress",
        metadata: { automationId: new mongoose.Types.ObjectId() },
    });
    await prepareAssistantTurn(
        source._id,
        "editor",
        "Edit the article. Files: /workspace/article-v1.md. Do not publish without human approval.",
    );
    source = await Task.findById(source._id);
});

it("joins parallel replies, resumes exactly one turn, then supports the next sequential stage", async () => {
    const result = await call("messageassistants", {
        messages: [
            {
                assistantId: "researcher",
                message: "Fact-check the draft; write facts.md.",
            },
            {
                assistantId: "reviewer",
                message: "Review style; write style.md.",
            },
        ],
        checkpoint,
        wait: true,
    });
    expect(result.assistantYield).toBe(true);
    expect(createBackgroundTask).toHaveBeenCalledTimes(2);
    await Task.updateOne(
        { _id: source._id },
        { executionStartedAt: new Date(), dispatchPending: false },
    );
    await parkAssistantTurn(source._id, "Both reviews requested.");
    const requests = await AssistantMessage.find().sort({ _id: 1 });
    await Task.updateOne(
        { _id: requests[0].taskId },
        {
            status: "completed",
            data: { result: "Facts saved to /workspace/facts.md" },
        },
    );
    await reconcileAssistantMessages();
    expect(enqueueAssistantContinuation).not.toHaveBeenCalled();
    await Task.updateOne(
        { _id: requests[1].taskId },
        {
            status: "completed",
            data: { result: "Style review saved to /workspace/style.md" },
        },
    );
    await Promise.all([
        reconcileAssistantMessages(),
        reconcileAssistantMessages(),
    ]);
    source = await Task.findById(source._id);
    expect(source.assistantTurn).toBe(1);
    expect(source.executionStartedAt).toBeNull();
    expect(source.dispatchPending).toBe(false);
    expect(source.status).toBe("pending");
    expect(
        enqueueAssistantContinuation.mock.calls.every(
            ([task]) => task.assistantTurn === 1,
        ),
    ).toBe(true);
    const resumed = await prepareAssistantTurn(
        source._id,
        "editor",
        "Ignored replacement task",
    );
    expect(resumed.prompt).toContain("/workspace/facts.md");
    expect(resumed.prompt).toContain("/workspace/style.md");
    expect(resumed.prompt).toContain("Human approval is required");
    expect(resumed.prompt).toContain("Do not start over");
    await Task.updateOne({ _id: source._id }, { status: "in_progress" });
    await call(
        "messageassistants",
        {
            messages: [
                {
                    assistantId: "reviewer",
                    message: "Approve v2 after the edits.",
                },
            ],
            checkpoint:
                "v2 saved at /workspace/article-v2.md. Await final review.",
            wait: true,
        },
        { operationId: "stage-2" },
    );
    expect(await AssistantMessage.countDocuments({ sourceTurn: 1 })).toBe(1);
});

it("executes a delegated worker with the recipient identity and returns its result to the sender", async () => {
    await call("messageassistants", {
        messages: [
            {
                assistantId: "researcher",
                message: "Verify draft facts at /workspace/article-v1.md",
            },
        ],
        checkpoint,
        wait: true,
    });
    const message = await AssistantMessage.findOne();
    const child = await Task.findById(message.taskId);
    const client = {
        query: jest.fn(async () => ({
            data: { sys_entity_agent: { result: "subscription" } },
        })),
    };
    const requestId = await assistantRun.startRequest({
        client,
        data: {
            taskId: String(child._id),
            userId: String(user._id),
            metadata: child.metadata,
        },
    });
    expect(requestId).toBe("subscription");
    expect(client.query.mock.calls[0][0].variables).toMatchObject({
        entityId: "researcher",
        agentToolsToken: "bound-token",
        stream: true,
    });
    expect(
        client.query.mock.calls[0][0].variables.chatHistory.find(
            (m) => m.role === "user",
        ).content,
    ).toContain("/workspace/article-v1.md");
    expect(issueAgentToolsToken).toHaveBeenLastCalledWith(
        user,
        "researcher",
        undefined,
        { taskId: String(child._id), turn: 0 },
    );
    await assistantRun.handleProgress(
        String(child._id),
        JSON.stringify("Facts checked. Output: /workspace/facts.md"),
    );
    const result = await assistantRun.handleCompletion(
        String(child._id),
        "fallback",
    );
    await Task.updateOne(
        { _id: child._id },
        { status: "completed", data: result },
    );
    await parkAssistantTurn(source._id, "Waiting for researcher");
    await reconcileAssistantMessages();
    expect(
        (await AssistantMessage.findById(message._id)).payload.answer,
    ).toContain("Facts checked.");
    expect((await Task.findById(source._id)).status).toBe("pending");
});

it("allows independent work before waiting, and does not resume during the running turn", async () => {
    const response = await call("askuser", {
        question: "May we publish?",
        checkpoint,
        wait: false,
    });
    expect(response.assistantYield).toBeUndefined();
    expect((await Task.findById(source._id)).status).toBe("in_progress");
    const question = await AssistantMessage.findOne();
    await AssistantMessage.updateOne(
        { _id: question._id },
        {
            status: "answered",
            payload: { ...question.payload, answer: "No. Keep as draft." },
        },
    );
    await reconcileAssistantMessages();
    expect(enqueueAssistantContinuation).not.toHaveBeenCalled();
    await parkAssistantTurn(source._id, "Independent research completed.");
    getTaskLiveState.mockResolvedValue({ lastSeenAt: new Date() });
    await reconcileAssistantMessages();
    expect(enqueueAssistantContinuation).not.toHaveBeenCalled();
    getTaskLiveState.mockResolvedValue(null);
    await reconcileAssistantMessages();
    expect(enqueueAssistantContinuation).toHaveBeenCalledTimes(1);
});

it("keeps private continuation details out of ordinary and shared task reads", async () => {
    const publicRead = await Task.findOne({ _id: source._id }).lean();
    expect(publicRead.assistantContext).toBeUndefined();
    const privateRead = await Task.findOne({ _id: source._id }).select(
        "+assistantContext",
    );
    expect(privateRead.assistantContext.brief).toContain("Do not publish");
});

it("opens the exact question chat, briefs it, and resumes only after a real user answer is resolved", async () => {
    await call("askuser", {
        question: "Which version should I use?",
        checkpoint,
        wait: true,
    });
    await parkAssistantTurn(source._id, "Waiting for version selection.");
    const question = await AssistantMessage.findOne();
    const notification = await Notification.findOne();
    expect(notification.metadata.chatId).toBe(String(question.chatId));
    const chat = await Chat.findById(question.chatId);
    expect(chat.assistantQuestionId).toBeUndefined();
    const context = await questionContext(user, chat, "editor");
    expect(context).toContain("/workspace/article-v1.md");
    expect(context).toContain("Do not resolve merely because");
    const answerBinding = { chatId: String(chat._id) };
    await expect(
        call(
            "answertaskquestion",
            { answer: "Use v2" },
            { binding: answerBinding },
        ),
    ).rejects.toThrow("Wait for the user's answer");
    await appendChatMessage(chat, {
        payload: "Use v2, but do not publish it.",
        sender: "user",
        direction: "outgoing",
        position: "single",
        sentTime: new Date().toISOString(),
    });
    const answer = { answer: "Use v2. Do not publish." };
    await Promise.all([
        call("answertaskquestion", answer, { binding: answerBinding }),
        call("answertaskquestion", answer, { binding: answerBinding }),
    ]);
    await reconcileAssistantMessages();
    const continuation = await prepareAssistantTurn(source._id, "editor", "");
    expect(continuation.prompt).toContain("Use v2. Do not publish.");
    expect((await Task.findById(source._id)).assistantTurn).toBe(1);
});

it("rejects cross-user, foreign assistant, unrelated chat, shared chat, and stale turn attempts", async () => {
    const args = {
        messages: [{ assistantId: "researcher", message: "Review" }],
        checkpoint,
        wait: true,
    };
    await expect(
        call("messageassistants", args, {
            user: { ...user, _id: new mongoose.Types.ObjectId() },
        }),
    ).rejects.toThrow();
    await expect(
        call("messageassistants", {
            ...args,
            messages: [{ assistantId: "foreign", message: "Review" }],
        }),
    ).rejects.toThrow();
    await expect(
        call("messageassistants", args, {
            binding: { ...binding(), turn: 99 },
        }),
    ).rejects.toThrow("no longer active");
    await call("askuser", {
        question: "Choose a source",
        checkpoint,
        wait: true,
    });
    const question = await AssistantMessage.findOne();
    const chat = await Chat.findById(question.chatId);
    await expect(
        call(
            "answertaskquestion",
            { answer: "yes" },
            { binding: { chatId: String(new mongoose.Types.ObjectId()) } },
        ),
    ).rejects.toThrow();
    await Chat.updateOne({ _id: chat._id }, { isPublic: true });
    await expect(questionContext(user, chat, "editor")).rejects.toThrow(
        "private chat",
    );
    expect(await AssistantMessage.countDocuments()).toBe(1);
});

it("repairs interrupted delivery without duplicating requests, chats or invocations", async () => {
    const args = {
        messages: [{ assistantId: "researcher", message: "Review" }],
        checkpoint,
        wait: true,
    };
    createBackgroundTask.mockRejectedValueOnce(new Error("queue unavailable"));
    expect((await call("messageassistants", args)).success).toBe(true);
    expect((await AssistantMessage.findOne()).delivered).toBe(false);
    await reconcileAssistantMessages();
    await call("messageassistants", args);
    expect(await AssistantMessage.countDocuments()).toBe(1);
    expect(await Task.countDocuments({ type: "assistant-run" })).toBe(1);
    await call(
        "askuser",
        { question: "Which source?", checkpoint, wait: true },
        { operationId: "question" },
    );
    await call(
        "askuser",
        { question: "Which source?", checkpoint, wait: true },
        { operationId: "question" },
    );
    expect(await Chat.countDocuments()).toBe(1);
    expect(await Notification.countDocuments()).toBe(1);
});

it("passes child failure to the parent as failure, not approval", async () => {
    await call("messageassistants", {
        messages: [{ assistantId: "reviewer", message: "Approve" }],
        checkpoint,
        wait: true,
    });
    await parkAssistantTurn(source._id, "Awaiting approval.");
    const message = await AssistantMessage.findOne();
    await Task.updateOne(
        { _id: message.taskId },
        { status: "failed", error: "Review could not run" },
    );
    await reconcileAssistantMessages();
    const resumed = await prepareAssistantTurn(source._id, "editor", "");
    expect(resumed.prompt).toContain('"status": "failed"');
    expect(resumed.prompt).toContain("Review could not run");
});

it("repairs the resume queue crash window and refuses to wake a cancelled root", async () => {
    await call("messageassistants", {
        messages: [{ assistantId: "reviewer", message: "Review" }],
        checkpoint,
        wait: true,
    });
    const message = await AssistantMessage.findOne();
    await Task.updateOne(
        { _id: message.taskId },
        { status: "completed", data: { result: "Done" } },
    );
    await parkAssistantTurn(source._id, "");
    enqueueAssistantContinuation.mockRejectedValueOnce(
        new Error("queue interrupted"),
    );
    await expect(reconcileAssistantMessages()).rejects.toThrow(
        "could not be delivered",
    );
    expect((await Task.findById(source._id)).status).toBe("pending");
    await reconcileAssistantMessages();
    expect((await Task.findById(source._id)).assistantTurn).toBe(1);
    await Task.updateOne({ _id: source._id }, { status: "cancelled" });
    enqueueAssistantContinuation.mockClear();
    await reconcileAssistantMessages();
    expect(enqueueAssistantContinuation).not.toHaveBeenCalled();
});

it("supports a chat-originated workflow without keeping the chat stream alive", async () => {
    const chat = await Chat.create({
        userId: user._id,
        selectedEntityId: "editor",
        isChatLoading: true,
    });
    const anchorId = new mongoose.Types.ObjectId();
    await call(
        "messageassistants",
        {
            messages: [{ assistantId: "researcher", message: "Research this" }],
            checkpoint,
            wait: true,
        },
        {
            binding: {
                anchor: true,
                taskId: String(anchorId),
                chatId: String(chat._id),
                turn: 0,
            },
        },
    );
    const message = await AssistantMessage.findOne();
    await Task.updateOne(
        { _id: message.taskId },
        { status: "completed", data: { result: "Research complete" } },
    );
    await reconcileAssistantMessages();
    expect(enqueueAssistantContinuation).not.toHaveBeenCalled();
    await appendChatMessage(chat, {
        payload:
            "Independent work finished: draft saved at /workspace/independent-v2.md",
        sender: "concierge",
        direction: "incoming",
        position: "single",
        sentTime: new Date().toISOString(),
    });
    await Chat.updateOne({ _id: chat._id }, { isChatLoading: false });
    await reconcileAssistantMessages();
    expect((await Task.findById(anchorId)).assistantTurn).toBe(1);
    const continued = await prepareAssistantTurn(anchorId, "editor", "");
    expect(continued.prompt).toContain("/workspace/independent-v2.md");
});

it("holds a paused sender and continues when it becomes active again", async () => {
    await call("messageassistants", {
        messages: [{ assistantId: "reviewer", message: "Review" }],
        checkpoint,
        wait: true,
    });
    const message = await AssistantMessage.findOne();
    await Task.updateOne(
        { _id: message.taskId },
        { status: "completed", data: { result: "Reviewed" } },
    );
    await parkAssistantTurn(source._id, "Await review.");
    const normalLookup = requireColleague.getMockImplementation();
    requireColleague.mockImplementation(async (u, id) => ({
        ...(await normalLookup(u, id)),
        status: "paused",
    }));
    await reconcileAssistantMessages();
    expect((await Task.findById(source._id)).status).toBe("waiting");
    expect(enqueueAssistantContinuation).not.toHaveBeenCalled();
    requireColleague.mockImplementation(normalLookup);
    await reconcileAssistantMessages();
    expect((await Task.findById(source._id)).status).toBe("pending");
});

it("closes unanswered questions when the originating task is cancelled", async () => {
    await call("askuser", { question: "Approve?", checkpoint, wait: true });
    await parkAssistantTurn(source._id, "Await approval.");
    await Task.updateOne({ _id: source._id }, { status: "cancelled" });
    await reconcileAssistantMessages();
    expect((await AssistantMessage.findOne()).status).toBe("failed");
    expect(enqueueAssistantContinuation).not.toHaveBeenCalled();
});

it("bounds cycles across forks and does not spend the message budget again on replay", async () => {
    const args = {
        messages: [{ assistantId: "reviewer", message: "Review" }],
        checkpoint,
        wait: true,
    };
    await call("messageassistants", args);
    await call("messageassistants", args);
    expect((await Task.findById(source._id)).assistantDispatches).toHaveLength(
        1,
    );
    await Task.updateOne(
        { _id: source._id },
        {
            assistantDispatches: Array.from(
                { length: 64 },
                (_, i) => `used-${i}`,
            ),
        },
    );
    await expect(
        call("messageassistants", args, { operationId: "over-budget" }),
    ).rejects.toThrow("64-message limit");
    await Task.updateOne({ _id: source._id }, { assistantDepth: 8 });
    await expect(
        call("messageassistants", args, { operationId: "too-deep" }),
    ).rejects.toThrow("delegation depth limit");
    expect(await AssistantMessage.countDocuments()).toBe(1);
});

it("accepts legacy personal chats but never another assistant's chat", async () => {
    const chat = await Chat.create({ userId: user._id, selectedEntityId: "" });
    const anchor = {
        anchor: true,
        taskId: String(new mongoose.Types.ObjectId()),
        chatId: String(chat._id),
        turn: 0,
    };
    await call(
        "askuser",
        { question: "Which version?", checkpoint, wait: true },
        { binding: anchor },
    );
    await expect(
        call(
            "askuser",
            { question: "Which version?", checkpoint, wait: true },
            {
                entity: entities[1],
                operationId: "wrong-assistant",
                binding: {
                    ...anchor,
                    taskId: String(new mongoose.Types.ObjectId()),
                },
            },
        ),
    ).rejects.toThrow("private chat");
});

it("gives a fresh chat the named receipts and refuses a second handoff on a status follow-up", async () => {
    const chat = await Chat.create({
        userId: user._id,
        selectedEntityId: entity.id,
        isPublic: false,
    });
    const first = {
        chatId: String(chat._id),
        taskId: String(new mongoose.Types.ObjectId()),
        anchor: true,
        turn: 0,
    };
    const args = {
        messages: [{ assistantId: "reviewer", message: "Review draft.md" }],
        title: "Review the article",
        checkpoint,
        wait: false,
    };
    const receipt = await call("messageassistants", args, { binding: first });
    expect(receipt.receipts[0]).toMatchObject({
        name: "reviewer",
        delivery: "delivered",
        request: "Review draft.md",
    });
    const context = await assistantChatContext(user, chat, entity.id);
    expect(context).toContain("Review the article");
    expect(context).toContain('"name":"reviewer"');
    expect(context).toContain("never call MessageAssistants merely to check");
    const second = { ...first, taskId: String(new mongoose.Types.ObjectId()) };
    const duplicate = await call(
        "messageassistants",
        {
            ...args,
            messages: [
                {
                    assistantId: "reviewer",
                    message: "Consolidate and review draft.md",
                },
            ],
        },
        { binding: second, operationId: "follow-up" },
    );
    expect(duplicate).toMatchObject({
        success: false,
        code: "existing_request",
        created: false,
    });
    expect(createBackgroundTask).toHaveBeenCalledTimes(1);
    expect(
        await Task.countDocuments({ type: "assistant-run", assistantDepth: 0 }),
    ).toBe(1);
    await call(
        "messageassistants",
        {
            ...args,
            messages: [
                {
                    assistantId: "reviewer",
                    message: "Separately review another article",
                    separateTask: true,
                },
            ],
        },
        { binding: second, operationId: "different-task" },
    );
    expect(createBackgroundTask).toHaveBeenCalledTimes(2);
});

it("reads current recipient completion before reconciliation and keeps tasks scoped to their assistant and owner", async () => {
    await call("messageassistants", {
        messages: [{ assistantId: "researcher", message: "Find sources" }],
        checkpoint,
        wait: true,
    });
    await parkAssistantTurn(source._id, "Await research");
    const message = await AssistantMessage.findOne();
    await Task.updateOne(
        { _id: message.taskId },
        { $set: { status: "completed", data: { result: "Sources ready" } } },
    );
    const { tasks } = await readAssistantTasks(user, entity.id, {
        taskId: String(source._id),
    });
    expect(tasks[0]).toMatchObject({
        status: "waiting",
        repliesReady: true,
        waitingFor: [],
        requests: [
            expect.objectContaining({ name: "researcher", status: "answered" }),
        ],
    });
    await expect(
        readAssistantTasks(user, "reviewer", { taskId: String(source._id) }),
    ).rejects.toThrow("not assigned");
    await expect(
        readAssistantTasks(
            { ...user, _id: new mongoose.Types.ObjectId() },
            entity.id,
            { taskId: String(source._id) },
        ),
    ).rejects.toThrow("not assigned");
    const visible = await Task.find({
        owner: user._id,
        ...VISIBLE_ASSISTANT_TASK_FILTER,
    });
    expect(visible.map((t) => String(t._id))).toEqual([String(source._id)]);
    const enriched = await enrichAssistantTasks(visible, user);
    expect(enriched[0].assistantContext).toBeUndefined();
    expect(
        enriched[0].assistantProgress.requests[0].checkpoint,
    ).toBeUndefined();
});

it("does not inject private receipts into shared chats", async () => {
    const chat = await Chat.create({
        userId: user._id,
        selectedEntityId: entity.id,
        isPublic: true,
    });
    expect(await assistantChatContext(user, chat, entity.id)).toBeNull();
});

it("shows a recipient overlapping assignments from the same sender before doing more work", async () => {
    const first = await call("messageassistants", {
        messages: [
            {
                assistantId: "researcher",
                message: "Research the article and return sources",
            },
        ],
        checkpoint,
        wait: false,
    });
    const message = await AssistantMessage.findById(first.messageIds[0]);
    const context = await assistantAssignmentContext(
        user,
        "researcher",
        "another-task",
    );
    expect(context).toContain(String(message.taskId));
    expect(context).toContain('"senderName":"editor"');
    expect(context).toContain("Research the article and return sources");
    expect(context).toContain("do not repeat it");
    expect(context).toContain("Do not spawn another task");
});

it("delivers the final result to the source chat even when another conversation is more recent", async () => {
    const original = await Chat.create({
        userId: user._id,
        selectedEntityId: entity.id,
        isPublic: false,
    });
    await Chat.create({
        userId: user._id,
        selectedEntityId: entity.id,
        isPublic: false,
    });
    const task = await Task.create({
        owner: user._id,
        type: "assistant-run",
        status: "in_progress",
        assistantEntityId: entity.id,
        assistantContext: {
            sourceChatId: String(original._id),
            brief: "Review draft",
        },
    });
    await assistantRun.handleCompletion(task._id, "Reviewed draft");
    const notice = await Notification.findOne({ owner: user._id });
    expect(notice.metadata.chatId).toBe(String(original._id));
});

it("creates one stable conversation for a background-only final result", async () => {
    await assistantRun.handleCompletion(source._id, "Reviewed result");
    const first = await Notification.findOne({ owner: user._id });
    expect(first.metadata.chatId).toBeTruthy();
    await assistantRun.handleCompletion(source._id, "Reviewed result");
    expect(await Chat.countDocuments()).toBe(1);
    expect(await Notification.countDocuments()).toBe(1);
    const history = await readChatMessages(
        await Chat.findById(first.metadata.chatId),
    );
    expect(history.messages).toHaveLength(1);
});

it("refuses private progress lookups from a shared chat capability", async () => {
    const chat = await Chat.create({
        userId: user._id,
        selectedEntityId: entity.id,
        isPublic: true,
    });
    await expect(
        call(
            "readassistanttasks",
            {},
            { binding: { chatId: String(chat._id) } },
        ),
    ).rejects.toThrow("private chat");
});

// Generic teams use the same queue and envelopes as ordinary handoffs.
const hash = (s) => createHash("sha256").update(s).digest("hex");
const artifact = (v = "v1") => ({
    path: `/workspace/teams/test/article-${v}.md`,
    sha256: hash(v),
});
async function startTeam() {
    await Task.updateOne({ _id: source._id }, { type: "assistant-run" });
    return call("startassistantteam", {
        title: "Make an article",
        goal: "Research, write, fact-check and edit an article. Do not publish.",
        acceptanceCriteria: [
            "Claims supported",
            "Final draft independently reviewed",
        ],
    });
}
async function recruit(id) {
    return call("recruitassistant", {
        roleKey: id,
        role: `Work as ${id}`,
        assistantId: id,
    });
}
async function memberCall(message, tool, args, operationId = "member-call") {
    const task = await Task.findById(message.taskId);
    return call(tool, args, {
        entity: entities.find((e) => e.id === message.toEntityId),
        binding: { taskId: String(task._id), turn: task.assistantTurn },
        operationId,
    });
}
async function runMember(message) {
    await Task.updateOne({ _id: message.taskId }, { status: "in_progress" });
    await prepareAssistantTurn(
        message.taskId,
        message.toEntityId,
        message.payload.message,
    );
}
async function finishMember(message, outcome, refs = [artifact()]) {
    await memberCall(message, "completeassistanttask", {
        outcome,
        summary: `${outcome}: checked actual files`,
        artifacts: refs,
        evidence: ["Inspected sources and final file"],
    });
    const data = await assistantRun.handleCompletion(
        String(message.taskId),
        "ignored prose",
    );
    await Task.updateOne(
        { _id: message.taskId },
        { status: "completed", data },
    );
    await reconcileAssistantMessages();
    return data;
}
async function resumeSource() {
    source = await Task.findById(source._id);
    await Task.updateOne({ _id: source._id }, { status: "in_progress" });
}

it("creates a durable generic team, recruits existing specialists idempotently and rejects outsiders", async () => {
    const team = await startTeam();
    expect(team.workspace).toBe(`/workspace/teams/${source._id}`);
    expect(team.acceptanceCriteria).toHaveLength(2);
    await recruit("researcher");
    await recruit("researcher");
    const state = await call("readassistantteam", {});
    expect(state.members).toHaveLength(2);
    await expect(
        call(
            "readassistantteam",
            { teamId: team.teamId },
            { entity: entities[2] },
        ),
    ).rejects.toThrow(/not a member/);
    await expect(
        call(
            "readassistantteam",
            { teamId: team.teamId },
            { user: { ...user, _id: new mongoose.Types.ObjectId() } },
        ),
    ).rejects.toThrow(/not a member/);
    await expect(
        call("messageassistants", {
            messages: [{ assistantId: "reviewer", message: "Do work" }],
            checkpoint,
        }),
    ).rejects.toThrow(/Recruit/);
    await expect(
        call("updateassistantteam", { revision: 0, plan: "Stale plan" }),
    ).rejects.toThrow(/current revision/);
    await call("updateassistantteam", {
        revision: state.revision,
        plan: "Research then review",
        decision: "Do not publish",
    });
    const saved = await Task.findOne({ _id: source._id }).select(
        "+assistantTeam",
    );
    expect(saved.assistantTeam.plan).toBe("Research then review");
    expect(
        (await Task.findOne({ _id: source._id }).lean()).assistantTeam,
    ).toBeUndefined();
});

it("requires an existing assistant and never creates identities during recruitment", async () => {
    await startTeam();
    const { colleagueRequest } = await import("../colleagues.js");
    await expect(
        call("recruitassistant", {
            roleKey: "research",
            role: "Research sources",
            name: "Researcher",
            instructions: "Verify claims",
        }),
    ).rejects.toThrow(/existing assistant/);
    const result = await recruit("researcher");
    expect(result.member.assistantId).toBe("researcher");
    await recruit("researcher");
    expect(colleagueRequest).not.toHaveBeenCalled();
});

it("answers a peer question in a separate turn while the coordinator waits, without redoing its assignment", async () => {
    await startTeam();
    await recruit("researcher");
    await call("messageassistants", {
        messages: [
            { assistantId: "researcher", message: "Research this article" },
        ],
        checkpoint,
    });
    await parkAssistantTurn(source._id, "Await research");
    const assignment = await AssistantMessage.findOne({
        toEntityId: "researcher",
    });
    await runMember(assignment);
    await memberCall(assignment, "messageassistants", {
        messages: [
            {
                assistantId: "editor",
                purpose: "question",
                message: "Are all three sources one report?",
            },
        ],
        checkpoint: "Need scope clarification",
    });
    await parkAssistantTurn(assignment.taskId, "Await clarification");
    const question = await AssistantMessage.findOne({ purpose: "question" });
    await runMember(question);
    await expect(
        memberCall(question, "messageassistants", {
            messages: [{ assistantId: "reviewer", message: "Redo report" }],
            checkpoint,
        }),
    ).rejects.toThrow();
    const data = await assistantRun.handleCompletion(
        String(question.taskId),
        "Yes, one report. Deduplicate the sources.",
    );
    expect(data.assistantWaiting).toBeUndefined();
    await Task.updateOne(
        { _id: question.taskId },
        { status: "completed", data },
    );
    await reconcileAssistantMessages();
    const resumed = await Task.findById(assignment.taskId);
    expect(resumed.status).toBe("pending");
    expect(resumed.assistantTurn).toBe(1);
    expect((await Task.findById(source._id)).status).toBe("waiting");
    const prompt = await prepareAssistantTurn(
        assignment.taskId,
        "researcher",
        "",
    );
    expect(prompt.prompt).toContain("Deduplicate the sources");
    expect(
        await AssistantMessage.countDocuments({ purpose: "assignment" }),
    ).toBe(1);
});

it("requires a reviewed exact final version and permits revision stages before one coordinator result", async () => {
    await startTeam();
    await recruit("researcher");
    await recruit("reviewer");
    await call("messageassistants", {
        messages: [{ assistantId: "researcher", message: "Write v1" }],
        checkpoint,
    });
    await parkAssistantTurn(source._id, "Await v1");
    const assignment = await AssistantMessage.findOne({
        toEntityId: "researcher",
    });
    await runMember(assignment);
    await finishMember(assignment, "completed");
    await resumeSource();
    await expect(
        call("finishassistantteam", {
            summary: "Done",
            artifacts: [artifact()],
            evidence: ["Looks good"],
            reviewTaskIds: [String(assignment.taskId)],
        }),
    ).rejects.toThrow(/accepted review/);
    await call(
        "messageassistants",
        {
            messages: [
                {
                    assistantId: "reviewer",
                    purpose: "review",
                    reviewArtifacts: [artifact()],
                    message: "Review v1 against the criteria",
                },
            ],
            checkpoint,
        },
        { operationId: "review-v1" },
    );
    await parkAssistantTurn(source._id, "Await v1 review");
    const review = await AssistantMessage.findOne({ purpose: "review" });
    await runMember(review);
    await expect(
        memberCall(review, "completeassistanttask", {
            outcome: "needs_revision",
            summary: "Defect found",
            artifacts: [artifact("qa-report")],
            evidence: ["Observed stale game-over status"],
        }),
    ).rejects.toThrow(/every reviewed input file/);
    await finishMember(review, "needs_revision");
    await resumeSource();
    const state = await call("readassistantteam", {});
    expect(
        state.assignments.find((a) => a.purpose === "review").result.outcome,
    ).toBe("needs_revision");
    await call(
        "messageassistants",
        {
            messages: [
                {
                    assistantId: "researcher",
                    message: "Resolve review findings in v2",
                },
            ],
            checkpoint,
        },
        { operationId: "revise" },
    );
    await parkAssistantTurn(source._id, "Await revision");
    const revision = await AssistantMessage.findOne({
        toEntityId: "researcher",
        status: "pending",
    });
    await runMember(revision);
    await finishMember(revision, "completed", [artifact("v2")]);
    await resumeSource();
    await call(
        "messageassistants",
        {
            messages: [
                {
                    assistantId: "reviewer",
                    purpose: "review",
                    reviewArtifacts: [artifact("v2")],
                    message: "Check v2, including all v1 findings",
                },
            ],
            checkpoint,
        },
        { operationId: "review-v2" },
    );
    await parkAssistantTurn(source._id, "Await v2 review");
    const finalReview = await AssistantMessage.findOne({
        purpose: "review",
        status: "pending",
    });
    await runMember(finalReview);
    await finishMember(finalReview, "accepted", [artifact("v2")]);
    await resumeSource();
    const finishArgs = {
        summary: "Final article is ready in article-v2.md",
        artifacts: [artifact("v2")],
        evidence: ["All claims checked", "Independent review accepted v2"],
        reviewTaskIds: [String(finalReview.taskId)],
    };
    await expect(
        call("finishassistantteam", {
            ...finishArgs,
            artifacts: [
                { ...artifact("v2"), sha256: hash("edited after approval") },
            ],
        }),
    ).rejects.toThrow(/exact version/);
    const result = await call("finishassistantteam", finishArgs);
    expect(result.assistantYield).toBe(true);
    await expect(
        call("messageassistants", {
            messages: [{ assistantId: "researcher", message: "More work" }],
            checkpoint,
        }),
    ).rejects.toThrow(/final handback/);
    const data = await assistantRun.handleCompletion(
        String(source._id),
        "generic tool acknowledgement",
    );
    expect(data.result).toContain(finishArgs.summary);
    expect(data.result).toContain(
        `/api/assistant-teams/${source._id}/artifacts/0`,
    );
    expect(data.handback.artifacts).toEqual([artifact("v2")]);
    expect(data.assistantWaiting).toBeUndefined();
});

it("does not interpret a model turn ending as completion, and bounds automatic repair", async () => {
    await startTeam();
    // First chat turn establishes the team; a fresh background turn runs it.
    await parkAssistantTurn(source._id, "I will make a team");
    await reconcileAssistantMessages();
    await resumeSource();
    expect(await parkAssistantTurn(source._id, "Still just planning")).toBe(
        true,
    );
    await reconcileAssistantMessages();
    await resumeSource();
    expect(await parkAssistantTurn(source._id, "Still no handback")).toBe(true);
    await reconcileAssistantMessages();
    await resumeSource();
    await expect(parkAssistantTurn(source._id, "I am done")).rejects.toThrow(
        /without completing/,
    );
    expect((await call("readassistantteam", {})).state).toBe("active");
});

it("continues a saved checkpoint without outgoing messages and stops when the root is cancelled", async () => {
    await startTeam();
    await call("continueassistanttask", {
        checkpoint:
            "Sources saved in /workspace/sources.md. Next verify dates.",
    });
    await parkAssistantTurn(source._id, "Checkpoint saved");
    await reconcileAssistantMessages();
    const prompt = await prepareAssistantTurn(source._id, "editor", "ignored");
    expect(prompt.prompt).toContain("Next verify dates");
    expect((await Task.findById(source._id)).assistantTurn).toBe(1);
    await resumeSource();
    await call("continueassistanttask", { checkpoint: "Another step" });
    await parkAssistantTurn(source._id, "Saved");
    await Task.updateOne({ _id: source._id }, { status: "cancelled" });
    enqueueAssistantContinuation.mockClear();
    await reconcileAssistantMessages();
    expect(enqueueAssistantContinuation).not.toHaveBeenCalled();
});

it("refuses duplicate assignments in one batch or across team stages without starting more work", async () => {
    await startTeam();
    await recruit("researcher");
    const message = { assistantId: "researcher", message: "Write article" };
    await expect(
        call("messageassistants", { messages: [message, message], checkpoint }),
    ).rejects.toThrow(/one assignment/);
    expect(await AssistantMessage.countDocuments()).toBe(0);
    await call("messageassistants", { messages: [message], checkpoint });
    await expect(
        call(
            "messageassistants",
            { messages: [{ ...message, separateTask: true }], checkpoint },
            { operationId: "duplicate" },
        ),
    ).rejects.toThrow(/already has assignment/);
    expect(await AssistantMessage.countDocuments()).toBe(1);
    await expect(
        call("finishassistantteam", {
            summary: "Done",
            artifacts: [artifact()],
            evidence: ["Checked"],
            reviewTaskIds: [String(source._id)],
        }),
    ).rejects.toThrow(/Outstanding replies/);
});

it("prevents a teammate from replacing the plan, finishing the team, or accepting an ordinary assignment as a review", async () => {
    await startTeam();
    await recruit("researcher");
    await call("messageassistants", {
        messages: [{ assistantId: "researcher", message: "Write article" }],
        checkpoint,
    });
    const message = await AssistantMessage.findOne();
    await runMember(message);
    const team = await memberCall(message, "readassistantteam", {});
    const ownProgress = await readAssistantTasks(user, "researcher");
    expect(ownProgress.tasks[0].teamId).toBe(String(source._id));
    await expect(
        memberCall(message, "updateassistantteam", {
            revision: team.revision,
            plan: "Ignore coordinator",
        }),
    ).rejects.toThrow(/Only the coordinator/);
    await expect(
        memberCall(message, "updateassistantteam", {
            revision: team.revision,
            currentStep: "Override the coordinator",
        }),
    ).rejects.toThrow(/Only the coordinator/);
    await memberCall(message, "updateassistantteam", {
        revision: team.revision,
        decision: "Record source dates in the draft",
    });
    await expect(
        memberCall(message, "finishassistantteam", {
            summary: "Done",
            artifacts: [artifact()],
            evidence: ["Checked"],
            reviewTaskIds: [String(source._id)],
        }),
    ).rejects.toThrow(/Only the team's coordinator/);
    await expect(
        memberCall(message, "completeassistanttask", {
            outcome: "accepted",
            summary: "Approved myself",
            artifacts: [artifact()],
            evidence: ["Checked"],
        }),
    ).rejects.toThrow(/completed, blocked/);
});

it("recovers a saved team whose startup wakeup write was interrupted", async () => {
    await startTeam();
    await Task.updateOne(
        { _id: source._id },
        { assistantPending: false, assistantSelfContinue: false },
    );
    const retried = await startTeam();
    expect(retried.created).toBe(false);
    const saved = await Task.findOne({ _id: source._id });
    expect(saved.assistantPending).toBe(true);
    expect(saved.assistantSelfContinue).toBe(true);
});

async function attachJobConversation({ personal = false } = {}) {
    const chat = await Chat.create({
        userId: user._id,
        selectedEntityId: personal ? "" : entity.id,
        isPublic: false,
        title: "The job",
    });
    const stored = await Task.findOne({ _id: source._id }).select(
        "+assistantContext",
    );
    await Task.updateOne(
        { _id: source._id },
        {
            $set: {
                type: "assistant-run",
                invokedFrom: { source: "chat", chatId: chat._id },
                assistantContext: {
                    ...stored.assistantContext,
                    sourceChatId: String(chat._id),
                },
            },
        },
    );
    return chat;
}
async function userReply(
    chat,
    payload = "Use v2. Open the reviewed file here; do not publish.",
) {
    return appendChatMessage(chat, {
        payload,
        sender: "user",
        direction: "outgoing",
        position: "single",
        sentTime: new Date().toISOString(),
    });
}
it("keeps successive job questions and final delivery in the original personal chat", async () => {
    const chat = await attachJobConversation({ personal: true });
    await Chat.create({
        userId: user._id,
        selectedEntityId: entity.id,
        isPublic: false,
        title: "Unrelated newer chat",
    });
    for (const operationId of ["question-a", "question-b"])
        await call(
            "askuser",
            { question: "Which version?", checkpoint, wait: false },
            { operationId },
        );
    const questions = await AssistantMessage.find().sort({ createdAt: 1 });
    expect(questions).toHaveLength(2);
    expect(questions.every((q) => String(q.chatId) === String(chat._id))).toBe(
        true,
    );
    expect(await Chat.countDocuments()).toBe(2);
    const context = await questionContext(
        user,
        await Chat.findById(chat._id),
        entity.id,
    );
    expect(context).toContain(String(questions[0]._id));
    expect(context).toContain(String(questions[1]._id));
    expect(context).toContain("canvas/applet tools here");
    await userReply(chat);
    await expect(
        call(
            "answertaskquestion",
            { answer: "Use v2" },
            { binding: { chatId: String(chat._id) } },
        ),
    ).rejects.toThrow("Several questions");
    await call(
        "answertaskquestion",
        { questionId: String(questions[0]._id), answer: "Use v2" },
        { binding: { chatId: String(chat._id) } },
    );
    expect((await AssistantMessage.findById(questions[1]._id)).status).toBe(
        "pending",
    );
    await publishColleagueMessage(user, {
        _id: "stable-result",
        entityId: entity.id,
        name: entity.name,
        message: "Reviewed result",
        preferredChatId: String(chat._id),
    });
    const notice = await Notification.findOne({
        "metadata.message": "Reviewed result",
    });
    expect(String(notice.metadata.chatId)).toBe(String(chat._id));
    expect(await Chat.countDocuments()).toBe(2);
});
it("reuses one derived conversation for a job that started without chat", async () => {
    await Task.updateOne(
        { _id: source._id },
        { $set: { "invokedFrom.source": "automation" } },
    );
    await call(
        "askuser",
        { question: "First question", checkpoint, wait: false },
        { operationId: "q-first" },
    );
    await call(
        "askuser",
        { question: "Second question", checkpoint, wait: false },
        { operationId: "q-second" },
    );
    const messages = await AssistantMessage.find();
    expect(String(messages[0].chatId)).toBe(String(messages[1].chatId));
    expect(await Chat.countDocuments()).toBe(1);
    const task = await Task.findById(source._id);
    expect(String(task.invokedFrom.chatId)).toBe(String(messages[0].chatId));
    expect(task.invokedFrom.source).toBe("automation");
    const progress = await readAssistantTasks(user, entity.id, {
        taskId: String(source._id),
    });
    expect(progress.tasks[0].chatId).toBe(String(messages[0].chatId));
});
it("can establish a background job conversation before its first message", async () => {
    const first = await getAssistantConversation(user, source, {
        create: true,
    });
    const again = await getAssistantConversation(user, source, {
        create: true,
    });
    expect(String(again.chat._id)).toBe(String(first.chat._id));
    expect(await AssistantMessage.countDocuments()).toBe(0);
    expect(await Chat.countDocuments()).toBe(1);
    expect(String((await Task.findById(source._id)).invokedFrom.chatId)).toBe(
        String(first.chat._id),
    );
});
it("lets the coordinator resolve a specialist's question in the job conversation", async () => {
    const chat = await attachJobConversation();
    const child = await Task.create({
        owner: user._id,
        type: "assistant-run",
        status: "in_progress",
        assistantEntityId: "researcher",
        assistantRootId: source._id,
        assistantDepth: 1,
        assistantContext: { brief: "Research stage" },
    });
    await call(
        "askuser",
        { question: "Which region?", checkpoint, wait: true },
        {
            entity: entities[1],
            binding: { taskId: String(child._id), turn: 0 },
            operationId: "child-question",
        },
    );
    const question = await AssistantMessage.findOne();
    expect(question.fromEntityId).toBe("researcher");
    expect(String(question.chatId)).toBe(String(chat._id));
    expect(await questionContext(user, chat, entity.id)).toContain(
        '"askedBy":"researcher"',
    );
    await userReply(chat, "Use the UK sources.");
    await call(
        "answertaskquestion",
        { questionId: String(question._id), answer: "Use UK sources" },
        { binding: { chatId: String(chat._id) } },
    );
    expect((await AssistantMessage.findById(question._id)).payload.answer).toBe(
        "Use UK sources",
    );
});
it("waits for foreground canvas work to finish before resuming the same background job", async () => {
    const chat = await attachJobConversation();
    await call("askuser", {
        question: "Is delivery acceptable?",
        checkpoint,
        wait: true,
    });
    await parkAssistantTurn(source._id, "Waiting for delivery confirmation");
    const question = await AssistantMessage.findOne();
    await userReply(chat);
    await Chat.updateOne({ _id: chat._id }, { $set: { isChatLoading: true } });
    await call(
        "answertaskquestion",
        {
            questionId: String(question._id),
            answer: "Opened the existing reviewed build in this chat. No rebuild or publication.",
        },
        { binding: { chatId: String(chat._id) } },
    );
    await reconcileAssistantMessages();
    expect(enqueueAssistantContinuation).not.toHaveBeenCalled();
    await appendChatMessage(chat, {
        payload: "The canvas tool opened the reviewed build.",
        sentTime: new Date().toISOString(),
        sender: "concierge",
        direction: "incoming",
        position: "single",
        toolCalls: [{ name: "OpenCanvas", result: "reviewed-canvas-opened" }],
    });
    await Chat.updateOne({ _id: chat._id }, { $set: { isChatLoading: false } });
    await reconcileAssistantMessages();
    expect(enqueueAssistantContinuation).toHaveBeenCalledTimes(1);
    const next = await prepareAssistantTurn(source._id, entity.id, "");
    expect(next.prompt).toContain("canvas tool opened the reviewed build");
    expect(next.prompt).toContain("reviewed-canvas-opened");
    expect(next.prompt).toContain("No rebuild or publication");
    expect(await Chat.countDocuments()).toBe(1);
});
it("consolidates legacy question history and destinations once without deleting messages", async () => {
    const chat = await attachJobConversation();
    await userReply(chat, "Build a game.");
    await call("askuser", {
        question: "May I deliver this file?",
        checkpoint,
        wait: true,
    });
    const q = await AssistantMessage.findOne();
    const legacy = await Chat.create({
        userId: user._id,
        selectedEntityId: entity.id,
        assistantQuestionId: q._id,
        isPublic: false,
    });
    await userReply(legacy, "Open it here, please.");
    await appendChatMessage(legacy, {
        payload: "Opening the reviewed file.",
        position: "single",
        sentTime: new Date().toISOString(),
        direction: "incoming",
        sender: "concierge",
    });
    await AssistantMessage.updateOne(
        { _id: q._id },
        { $set: { chatId: legacy._id } },
    );
    const notice = await Notification.findOne();
    await Notification.updateOne(
        { _id: notice._id },
        {
            $set: {
                metadata: { ...notice.metadata, chatId: String(legacy._id) },
            },
        },
    );
    const originalCount = (
        await readChatMessages(await Chat.findById(chat._id))
    ).messages.length;
    const legacyMessages = (
        await readChatMessages(await Chat.findById(legacy._id))
    ).messages;
    expect(await consolidateQuestionConversation(user, legacy)).toBe(
        String(chat._id),
    );
    expect(await consolidateQuestionConversation(user, legacy)).toBe(
        String(chat._id),
    );
    const history = await readChatMessages(await Chat.findById(chat._id));
    expect(history.messages).toHaveLength(originalCount + 2);
    for (const original of legacyMessages) {
        const copy = history.messages.find(
            (m) => String(m._id) === String(original._id),
        );
        expect(copy.createdAt).toEqual(original.createdAt);
        expect(copy.sentTime).toEqual(original.sentTime);
    }
    expect(
        history.messages.some((m) => m.payload === "Open it here, please."),
    ).toBe(true);
    expect(
        (await readChatMessages(await Chat.findById(legacy._id))).messages,
    ).toHaveLength(2);
    expect((await Chat.findById(legacy._id)).archived).toBe(true);
    expect(String((await AssistantMessage.findById(q._id)).chatId)).toBe(
        String(chat._id),
    );
    expect((await Notification.findById(notice._id)).metadata.chatId).toBe(
        String(chat._id),
    );
});
it("does not consolidate shared or actively streaming legacy chats", async () => {
    const chat = await attachJobConversation();
    await call("askuser", { question: "Approval?", checkpoint, wait: true });
    const q = await AssistantMessage.findOne();
    const legacy = await Chat.create({
        userId: user._id,
        selectedEntityId: entity.id,
        assistantQuestionId: q._id,
        isPublic: true,
    });
    expect(await consolidateQuestionConversation(user, legacy)).toBeNull();
    await Chat.updateOne(
        { _id: legacy._id },
        { $set: { isPublic: false, isChatLoading: true } },
    );
    expect(await consolidateQuestionConversation(user, legacy)).toBeNull();
    expect(
        await consolidateQuestionConversation(
            { _id: new mongoose.Types.ObjectId() },
            legacy,
        ),
    ).toBeNull();
    expect(String(q.chatId)).toBe(String(chat._id));
});
it("never silently reroutes pinned results to another private chat after sharing changes", async () => {
    const chat = await attachJobConversation();
    await Chat.create({
        userId: user._id,
        selectedEntityId: entity.id,
        isPublic: false,
    });
    await Chat.updateOne({ _id: chat._id }, { $set: { isPublic: true } });
    await expect(
        publishColleagueMessage(user, {
            _id: "private-result",
            entityId: entity.id,
            name: entity.name,
            message: "Private result",
            preferredChatId: String(chat._id),
        }),
    ).rejects.toThrow("unavailable or shared");
    expect(await Notification.countDocuments()).toBe(0);
    expect(await Chat.countDocuments()).toBe(2);
});

it("lets only the coordinator publish a concise current stage", async () => {
    await startTeam();
    const root = await Task.findOne({ _id: source._id }).select(
        "+assistantTeam",
    );
    await call("updateassistantteam", {
        revision: root.assistantTeamRevision,
        currentStep: "Fact-checking the research",
    });
    const updated = await Task.findOne({ _id: source._id }).select(
        "+assistantTeam",
    );
    expect(updated.assistantTeam.currentStep).toBe(
        "Fact-checking the research",
    );
    await expect(
        call("updateassistantteam", {
            revision: root.assistantTeamRevision,
            currentStep: "Stale stage",
        }),
    ).rejects.toThrow(/revision/);
});

async function pausedReviewedTeam() {
    await startTeam();
    await recruit("reviewer");
    const chat = await attachJobConversation();
    const review = await Task.create({
        owner: user._id,
        type: "assistant-run",
        status: "completed",
        assistantRootId: source._id,
        assistantEntityId: "reviewer",
        assistantDepth: 1,
        data: {
            handback: {
                outcome: "accepted",
                artifacts: [artifact()],
                summary: "Reviewed exact bytes",
            },
        },
    });
    await AssistantMessage.create({
        owner: user._id,
        sourceTaskId: source._id,
        sourceTurn: 0,
        fromEntityId: "editor",
        toEntityId: "reviewer",
        taskId: review._id,
        purpose: "review",
        status: "answered",
        delivered: true,
        payload: {
            message: "Review final article",
            reviewArtifacts: [artifact()],
        },
    });
    await call("askuser", {
        question: "Where should I open the reviewed result?",
        checkpoint,
        wait: true,
    });
    await parkAssistantTurn(source._id, "Waiting for delivery");
    const question = await AssistantMessage.findOne({ toEntityId: null });
    const foreground = {
        anchor: true,
        taskId: String(new mongoose.Types.ObjectId()),
        turn: 0,
        chatId: String(chat._id),
    };
    const args = {
        teamId: String(source._id),
        summary: "Reviewed result opened here",
        artifacts: [artifact()],
        evidence: [
            "Sources verified",
            "Exact final version reviewed and delivered",
        ],
        reviewTaskIds: [String(review._id)],
        questionAnswers: [
            {
                questionId: String(question._id),
                answer: "The user requested delivery here; the canvas tool successfully opened the reviewed result. No publication.",
            },
        ],
    };
    enqueueAssistantContinuation.mockClear();
    return { chat, question, foreground, args };
}

it("finishes a paused reviewed job and its question in a later chat turn without a new run", async () => {
    const { chat, question, foreground, args } = await pausedReviewedTeam();
    await userReply(chat, "Open it here.");
    await appendChatMessage(chat, {
        payload: "Opened the reviewed result",
        sentTime: new Date().toISOString(),
        direction: "incoming",
        sender: "concierge",
        position: "single",
        toolCalls: [{ name: "OpenCanvas", result: "opened" }],
    });
    const result = await call("finishassistantteam", args, {
        binding: foreground,
    });
    expect(result.success).toBe(true);
    const root = await Task.findOne({ _id: source._id })
        .select("+assistantOutcome +assistantTeam")
        .exec();
    expect(root.status).toBe("completed");
    expect(root.assistantTeam.state).toBe("completed");
    expect(root.assistantTeam.result.questionAnswers).toEqual(
        args.questionAnswers,
    );
    expect(root.data.handback.reviewTaskIds).toEqual(args.reviewTaskIds);
    expect(root.assistantPending).toBe(false);
    expect((await AssistantMessage.findById(question._id)).status).toBe(
        "answered",
    );
    expect((await Notification.findOne()).read).toBe(true);
    expect(await questionContext(user, chat, entity.id)).toBeNull();
    await reconcileAssistantMessages();
    expect(enqueueAssistantContinuation).not.toHaveBeenCalled();
    expect(await Task.findById(foreground.taskId)).toBeNull();
    expect(await Chat.countDocuments()).toBe(1);
    expect(withAssistantDispatchLock).toHaveBeenCalledWith(
        `team:${user._id}:${source._id}`,
        expect.any(Function),
        undefined,
        { waitMs: 20000 },
    );
});

it("leaves the question and job untouched when foreground completion lacks review evidence", async () => {
    const { chat, question, foreground, args } = await pausedReviewedTeam();
    await userReply(chat);
    await expect(
        call(
            "finishassistantteam",
            { ...args, artifacts: [artifact("unreviewed")] },
            { binding: foreground },
        ),
    ).rejects.toThrow(/exact version/);
    expect((await AssistantMessage.findById(question._id)).status).toBe(
        "pending",
    );
    expect((await Task.findOne({ _id: source._id })).status).toBe("waiting");
    expect((await Notification.findOne()).read).toBe(false);
});

it("requires a real user reply before completing with question answers", async () => {
    const { question, foreground, args } = await pausedReviewedTeam();
    await expect(
        call("finishassistantteam", args, { binding: foreground }),
    ).rejects.toThrow(/user's answer/);
    expect((await AssistantMessage.findById(question._id)).status).toBe(
        "pending",
    );
});

it("refuses foreground completion from another chat or assistant, or while the worker is running", async () => {
    const { chat, foreground, args } = await pausedReviewedTeam();
    await userReply(chat);
    const other = await Chat.create({
        userId: user._id,
        selectedEntityId: "editor",
        isPublic: false,
        title: "Other",
    });
    await expect(
        call("finishassistantteam", args, {
            binding: { ...foreground, chatId: String(other._id) },
        }),
    ).rejects.toThrow(/coordinator conversation/);
    await Chat.updateOne({ _id: chat._id }, { selectedEntityId: "reviewer" });
    await expect(
        call("finishassistantteam", args, {
            binding: foreground,
            entity: entities[2],
        }),
    ).rejects.toThrow(/coordinator conversation/);
    await Chat.updateOne({ _id: chat._id }, { selectedEntityId: "editor" });
    await Task.updateOne({ _id: source._id }, { status: "in_progress" });
    await expect(
        call("finishassistantteam", args, { binding: foreground }),
    ).rejects.toThrow(/not paused/);
    expect(
        (await Task.findOne({ _id: source._id }).select("+assistantTeam"))
            .assistantTeam.state,
    ).toBe("active");
});

it("does not consume another job's question when jobs share a conversation", async () => {
    const { chat, foreground, args } = await pausedReviewedTeam();
    await userReply(chat);
    const other = await Task.create({
        owner: user._id,
        type: "assistant-run",
        status: "waiting",
        assistantEntityId: "editor",
    });
    const q = await AssistantMessage.create({
        owner: user._id,
        sourceTaskId: other._id,
        sourceTurn: 0,
        fromEntityId: "editor",
        chatId: chat._id,
        purpose: "question",
        status: "pending",
        payload: { message: "Publish?" },
    });
    await userReply(chat, "Do not publish.");
    await expect(
        call(
            "finishassistantteam",
            {
                ...args,
                questionAnswers: [{ questionId: String(q._id), answer: "No" }],
            },
            { binding: foreground },
        ),
    ).rejects.toThrow(/another team/);
    expect((await AssistantMessage.findById(q._id)).status).toBe("pending");
});

it("recovers question answers after a crash following the completion commit", async () => {
    const { chat, question, args } = await pausedReviewedTeam();
    await Task.updateOne(
        { _id: source._id },
        {
            $set: {
                status: "completed",
                "assistantTeam.state": "completed",
                "assistantTeam.result": {
                    outcome: "completed",
                    questionAnswers: args.questionAnswers,
                },
            },
        },
    );
    expect(await questionContext(user, chat, entity.id)).toBeNull();
    await reconcileAssistantMessages();
    const saved = await AssistantMessage.findById(question._id);
    expect(saved.status).toBe("answered");
    expect(saved.payload.answer).toBe(args.questionAnswers[0].answer);
    expect((await Notification.findOne()).read).toBe(true);
    expect(enqueueAssistantContinuation).not.toHaveBeenCalled();
});

it("closes leftover questions on terminal jobs without pretending the user approved them", async () => {
    const { chat, question } = await pausedReviewedTeam();
    await Task.updateOne({ _id: source._id }, { status: "completed" });
    expect(await questionContext(user, chat, entity.id)).toBeNull();
    await reconcileAssistantMessages();
    const saved = await AssistantMessage.findById(question._id);
    expect(saved.status).toBe("failed");
    expect(saved.payload.answer).toContain("No approval was inferred");
    expect((await Notification.findOne()).read).toBe(true);
    expect(enqueueAssistantContinuation).not.toHaveBeenCalled();
});

it("rechecks completion under the team lease before scheduling a continuation", async () => {
    const { question } = await pausedReviewedTeam();
    await AssistantMessage.updateOne(
        { _id: question._id },
        { status: "answered" },
    );
    withAssistantDispatchLock.mockImplementationOnce(async (scope, action) => {
        await Task.updateOne({ _id: source._id }, { status: "completed" });
        return action();
    });
    await reconcileAssistantMessages();
    expect(enqueueAssistantContinuation).not.toHaveBeenCalled();
    expect((await Task.findOne({ _id: source._id })).status).toBe("completed");
});

it("updates the existing paused team's stage from a later chat turn", async () => {
    const { chat, foreground, args } = await pausedReviewedTeam();
    const root = await Task.findOne({ _id: source._id });
    await call(
        "updateassistantteam",
        {
            teamId: args.teamId,
            revision: root.assistantTeamRevision,
            currentStep: "Delivering the reviewed result",
        },
        { binding: foreground },
    );
    expect(
        (await Task.findOne({ _id: source._id }).select("+assistantTeam"))
            .assistantTeam.currentStep,
    ).toBe("Delivering the reviewed result");
    expect(await Task.findById(foreground.taskId)).toBeNull();
    expect(await assistantChatContext(user, chat, entity.id)).toContain(
        "FinishAssistantTeam",
    );
    expect(await questionContext(user, chat, entity.id)).toContain(
        "questionAnswers",
    );
});

it("binds arrival receipts to the persisted message and keeps that binding on delivery retries", async () => {
    const chat = await attachJobConversation();
    const payload = {
        _id: "assistant-result:delivery-test",
        chatId: String(chat._id),
        entityId: entity.id,
        name: entity.name,
        kind: "result",
        message: "Reviewed result ready",
    };
    const first = await publishColleagueMessage(user, payload);
    const second = await publishColleagueMessage(user, payload);
    const history = await readChatMessages(await Chat.findById(chat._id));
    expect(history.messages).toHaveLength(1);
    expect(first.metadata.messageId).toBe(String(history.messages[0]._id));
    expect(second.metadata.messageId).toBe(first.metadata.messageId);
    expect(await Notification.countDocuments()).toBe(1);
    expect(second.read).toBe(false);
});
