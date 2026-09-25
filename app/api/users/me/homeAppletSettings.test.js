/** @jest-environment node */
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import User from "../../models/user.mjs";
import Digest from "../../models/digest.mjs";
import {
    readHomeItemsForUser,
    setHomeItemsForUser,
    addHomeAppletDirectoryItemForUser,
    removeHomeAppletDirectoryItemForUser,
} from "./homeAppletSettings";

let mongoServer;
let user;
let digest;
const objectId = () => new mongoose.Types.ObjectId();
const acknowledged = { legacyDigestsIncluded: true };
const keys = (items) =>
    items.map((item) => item.blockId || item.appletId || item.groupId);

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
        instance: { ip: "127.0.0.1" },
    });
    await mongoose.connect(mongoServer.getUri());
});
afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer?.stop();
});
beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Digest.deleteMany({})]);
    user = { _id: objectId() };
    // Raw insert models older documents without new Mongoose defaults.
    await User.collection.insertOne({
        ...user,
        username: "legacy@example.test",
    });
    digest = await Digest.create({
        owner: user._id,
        blocks: [
            {
                title: "Morning brief",
                prompt: "My custom briefing",
                content: "Saved report",
            },
            {
                title: "الموجز العربي",
                prompt: "بالعربية من اليمين إلى اليسار",
                content: "تقرير محفوظ",
            },
        ],
    });
});

test("restores an untouched legacy Home without writing either document", async () => {
    const beforeUser = await User.collection.findOne(user);
    const beforeDigest = await Digest.findOne({ _id: digest._id }).lean();
    const state = await readHomeItemsForUser(user);
    expect(state).toMatchObject({
        configured: true,
        defaultGroupMigrated: false,
    });
    expect(keys(state.items)).toEqual(digest.blocks.map((b) => String(b._id)));
    expect(state.items.map((i) => i.type)).toEqual(["digest", "digest"]);
    expect(await readHomeItemsForUser(user)).toEqual(state);
    expect(await User.collection.findOne(user)).toEqual(beforeUser);
    expect(await Digest.findOne({ _id: digest._id }).lean()).toEqual(
        beforeDigest,
    );
});

test("keeps fallback automation and applet order when recovering old digests", async () => {
    const automationId = objectId();
    digest.blocks.push({ title: "Scheduled", automationId });
    await digest.save();
    const appletId = objectId();
    await User.collection.updateOne(user, {
        $set: { homeAppletDirectory: [{ appletId, order: 0 }] },
    });
    const state = await readHomeItemsForUser(user);
    expect(state.items.map((i) => i.type)).toEqual([
        "digest",
        "digest",
        "automation",
        "applet",
    ]);
    expect(state.items[2].automationId).toBe(String(automationId));
    expect(state.items[3].appletId).toBe(String(appletId));
});

test("recovers missing digests alongside a layout saved after the regression", async () => {
    const automationId = objectId();
    const automationBlockId = objectId();
    const appletId = objectId();
    const items = [
        { type: "group", groupId: "my-group", title: "My reports", order: 0 },
        {
            type: "automation",
            blockId: String(automationBlockId),
            automationId,
            size: "mini",
            order: 1,
        },
        { type: "applet", appletId, size: "mini", order: 2 },
        {
            type: "digest",
            blockId: String(digest.blocks[1]._id),
            size: "mini",
            order: 3,
        },
    ];
    await User.collection.updateOne(user, {
        $set: {
            homeItemsConfigured: true,
            homeItemsDefaultGroupMigrated: true,
            homeItems: items,
        },
    });
    const state = await readHomeItemsForUser(user);
    expect(keys(state.items)).toEqual([
        "my-group",
        String(automationBlockId),
        String(appletId),
        String(digest.blocks[1]._id),
        String(digest.blocks[0]._id),
    ]);
    expect(state.items.slice(1, 4).map((i) => i.size)).toEqual([
        "mini",
        "mini",
        "mini",
    ]);
    expect(state.items[0].title).toBe("My reports");
    expect(state.defaultGroupMigrated).toBe(true);
});

test("recovers digests even when the regression-era layout was saved empty", async () => {
    await User.collection.updateOne(user, {
        $set: { homeItemsConfigured: true, homeItems: [] },
    });
    expect((await readHomeItemsForUser(user)).items).toHaveLength(2);
});

test("saves the compatibility view and honors removal across reloads without deleting content", async () => {
    const beforeDigest = await Digest.findOne({ _id: digest._id }).lean();
    const state = await readHomeItemsForUser(user);
    await setHomeItemsForUser(user, state.items, acknowledged);
    const savedUser = await User.collection.findOne(user);
    expect(savedUser.homeLegacyDigestsMigrated).toBe(true);
    expect(savedUser.homeItemsConfigured).toBe(true);
    await setHomeItemsForUser(user, state.items.slice(1), acknowledged);
    const reloaded = await readHomeItemsForUser(user);
    expect(keys(reloaded.items)).toEqual([String(digest.blocks[1]._id)]);
    await setHomeItemsForUser(user, [], acknowledged);
    expect((await readHomeItemsForUser(user)).items).toEqual([]);
    expect(await Digest.findOne({ _id: digest._id }).lean()).toEqual(
        beforeDigest,
    );
});

test("old browser saves preserve recovered cards but do not revive later removals", async () => {
    const appletId = objectId();
    await setHomeItemsForUser(user, [
        { type: "applet", appletId, size: "mini" },
    ]);
    let state = await readHomeItemsForUser(user);
    expect(state.items.map((i) => i.type)).toEqual([
        "applet",
        "digest",
        "digest",
    ]);
    expect(state.items[0].size).toBe("mini");
    await setHomeItemsForUser(user, state.items.slice(0, 1), acknowledged);
    await setHomeItemsForUser(user, [{ type: "applet", appletId }]);
    state = await readHomeItemsForUser(user);
    expect(state.items.map((i) => i.type)).toEqual(["applet"]);
});

test("applet pin and unpin keep restored digests and synchronize the directory", async () => {
    const appletId = objectId();
    await addHomeAppletDirectoryItemForUser(user, appletId);
    expect((await readHomeItemsForUser(user)).items.map((i) => i.type)).toEqual(
        ["digest", "digest", "applet"],
    );
    expect(
        (await User.collection.findOne(user)).homeAppletDirectory[0].appletId,
    ).toEqual(appletId);
    await removeHomeAppletDirectoryItemForUser(user, appletId);
    expect((await readHomeItemsForUser(user)).items).toHaveLength(2);
    expect((await User.collection.findOne(user)).homeAppletDirectory).toEqual(
        [],
    );
});

test("new accounts do not acquire an automatic default digest card", async () => {
    await User.collection.updateOne(user, {
        $set: { homeLegacyDigestsMigrated: true },
    });
    const query = jest.spyOn(Digest, "findOne");
    expect(await readHomeItemsForUser(user)).toEqual({
        items: [],
        configured: false,
        defaultGroupMigrated: false,
    });
    expect(query).not.toHaveBeenCalled();
    query.mockRestore();
});

test("does not create a digest, mark migration, or alter fallback when none exists", async () => {
    await Digest.deleteMany({});
    expect(await readHomeItemsForUser(user)).toEqual({
        items: [],
        configured: false,
        defaultGroupMigrated: false,
    });
    expect(await Digest.countDocuments()).toBe(0);
    expect(
        (await User.collection.findOne(user)).homeLegacyDigestsMigrated,
    ).toBeUndefined();
});

test("automation-only digests retain the existing unconfigured fallback", async () => {
    digest.blocks = [{ title: "Scheduled", automationId: objectId() }];
    await digest.save();
    expect((await readHomeItemsForUser(user)).configured).toBe(false);
});

test("only reads digests belonging to the requested user", async () => {
    await Digest.updateOne({ _id: digest._id }, { owner: objectId() });
    expect((await readHomeItemsForUser(user)).items).toEqual([]);
    expect(await readHomeItemsForUser({ _id: objectId() })).toMatchObject({
        items: [],
        configured: false,
    });
    expect(await readHomeItemsForUser(null)).toMatchObject({
        items: [],
        configured: false,
    });
});

test("does not truncate recovered layouts above the normal item cap", async () => {
    const items = Array.from({ length: 96 }, (_, index) => ({
        type: "group",
        groupId: `group-${index}`,
        title: `Group ${index}`,
        order: index,
    }));
    await User.collection.updateOne(user, {
        $set: {
            homeItemsConfigured: true,
            homeItemsDefaultGroupMigrated: true,
            homeItems: items,
        },
    });
    const state = await readHomeItemsForUser(user);
    expect(state.items).toHaveLength(98);
    await setHomeItemsForUser(user, state.items, acknowledged);
    expect((await readHomeItemsForUser(user)).items).toHaveLength(98);
    await expect(
        setHomeItemsForUser(
            user,
            [...state.items, { type: "group", groupId: "overflow" }],
            acknowledged,
        ),
    ).rejects.toMatchObject({ status: 400 });
    expect((await readHomeItemsForUser(user)).items).toHaveLength(98);
});

test("a failed digest read cannot acknowledge or erase legacy state", async () => {
    const before = await User.collection.findOne(user);
    const query = jest.spyOn(Digest, "findOne").mockImplementationOnce(() => ({
        select: () => ({
            lean: () => Promise.reject(new Error("database unavailable")),
        }),
    }));
    await expect(setHomeItemsForUser(user, [], acknowledged)).rejects.toThrow(
        "database unavailable",
    );
    query.mockRestore();
    expect(await User.collection.findOne(user)).toEqual(before);
});
