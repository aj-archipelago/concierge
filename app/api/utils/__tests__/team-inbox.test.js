/** @jest-environment node */
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Task from "../../models/task.mjs";
import Chat from "../../models/chat.mjs";
import Notification from "../../models/notification.mjs";
import AssistantMessage from "../../models/assistant-message.mjs";
import {
    listInboxItems,
    getInboxCounts,
    markNotificationsRead,
} from "../inbox.js";
import { linkLegacyTeamNotifications } from "../team-inbox.mjs";
import { colleagueNotificationId } from "../colleague-chat.js";
jest.mock("../task-liveness.mjs", () => ({
    getTaskLiveState: jest.fn(async () => null),
    mergeTaskLiveState: (task) => task,
    TASK_LIVE_STALE_MS: 45000,
}));
jest.mock("../task-migration.mjs", () => ({ migrateTasks: jest.fn() }));
let mongo, owner, chat;
const old = new Date(Date.now() - 8 * 86400000);
beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await mongoose.connect(mongo.getUri());
}, 60000);
afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
});
beforeEach(async () => {
    await Promise.all(
        Object.values(mongoose.connection.collections).map((c) =>
            c.deleteMany({}),
        ),
    );
    owner = new mongoose.Types.ObjectId();
    chat = await Chat.create({
        userId: owner,
        selectedEntityId: "assistant",
        isPublic: false,
    });
});
async function job(extra = {}) {
    return Task.create({
        owner,
        type: "assistant-run",
        status: "waiting",
        assistantEntityId: "assistant",
        assistantTeamRevision: 1,
        invokedFrom: { source: "automation", chatId: chat._id },
        assistantTeam: {
            title: "Build a game",
            state: "active",
            coordinatorId: "assistant",
            members: [
                { assistantId: "assistant", name: "Assistant", role: "Lead" },
            ],
        },
        ...extra,
    });
}
async function question(root, extra = {}) {
    return AssistantMessage.create({
        owner,
        sourceTaskId: root._id,
        sourceTurn: 0,
        fromEntityId: "assistant",
        toEntityId: null,
        purpose: "question",
        status: "pending",
        chatId: chat._id,
        payload: { message: "Which controls?", checkpoint: "Build saved" },
        ...extra,
    });
}
it("shows one actionable card for an old waiting job, counts it once, and hides digest noise", async () => {
    const root = await job({ createdAt: old, updatedAt: old });
    await question(root);
    const notices = await Notification.create(
        [1, 2].map(() => ({
            owner,
            type: "colleague-message",
            assistantRootId: root._id,
            createdAt: old,
            read: false,
        })),
    );
    const ordinary = await Notification.create({
        owner,
        type: "resource-shared",
    });
    await Task.create({ owner, type: "build-digest", status: "cancelled" });
    const page = await listInboxItems(owner, { limit: 1 });
    expect(page.requests).toHaveLength(1);
    expect(page.requests[0].team.teamId).toBe(String(root._id));
    expect(page.requests[0].notificationIds).toHaveLength(2);
    expect(page.requests[0].team.assignments[0].request).toBe(
        "Which controls?",
    );
    expect(page.unreadNotificationCount).toBe(2);
    expect(page.hasMore).toBe(true);
    const next = await listInboxItems(owner, { limit: 1, page: 2 });
    expect(String(next.requests[0]._id)).toBe(String(ordinary._id));
    expect(next.hasMore).toBe(false);
    await markNotificationsRead(owner, {
        ids: notices.map((n) => String(n._id)),
    });
    expect((await getInboxCounts(owner)).unreadNotificationCount).toBe(1);
    // Reading is not answering; the old question and job remain visible.
    expect(
        (await listInboxItems(owner)).requests[0].team.assignments[0].status,
    ).toBe("pending");
});
it("migrates exact legacy question and result notices without guessing from a shared chat", async () => {
    const first = await job();
    const second = await job();
    const answered = await question(first, { status: "answered" });
    const pending = await question(second);
    await Notification.create([
        {
            _id: colleagueNotificationId(`question:${answered._id}`),
            owner,
            type: "colleague-message",
        },
        {
            _id: colleagueNotificationId(`question:${pending._id}`),
            owner,
            type: "colleague-message",
        },
        {
            _id: colleagueNotificationId(`assistant-result:${first._id}`),
            owner,
            type: "colleague-message",
        },
        {
            owner,
            type: "colleague-message",
            metadata: { chatId: String(chat._id) },
        },
    ]);
    await linkLegacyTeamNotifications(owner);
    await linkLegacyTeamNotifications(owner);
    expect(await Notification.countDocuments()).toBe(4);
    const answeredNotice = await Notification.findById(
        colleagueNotificationId(`question:${answered._id}`),
    );
    expect(answeredNotice.read).toBe(true);
    expect(String(answeredNotice.assistantRootId)).toBe(String(first._id));
    const page = await listInboxItems(owner);
    expect(page.requests.filter((i) => i.team)).toHaveLength(2);
    expect(
        page.requests.filter((i) => i.type === "colleague-message"),
    ).toHaveLength(1);
    expect(
        new Set(page.requests.filter((i) => i.team).map((i) => i.team.teamId))
            .size,
    ).toBe(2);
});
it("keeps dismissed active jobs visible, hides dismissed completed jobs, and respects the owner", async () => {
    await job({ dismissed: true, updatedAt: old, createdAt: old });
    await job({ dismissed: true, status: "completed" });
    await job({ owner: new mongoose.Types.ObjectId() });
    const page = await listInboxItems(owner);
    expect(page.requests).toHaveLength(1);
    expect(page.requests[0].status).toBe("waiting");
    expect(
        (await listInboxItems(owner, { showDismissed: true })).requests,
    ).toHaveLength(2);
});
