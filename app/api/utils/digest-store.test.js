/** @jest-environment node */
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Digest from "../models/digest.mjs";
import { updateDigestBlocks } from "./digest-store.mjs";
import { buildDigestBlock } from "../../../jobs/digest-build.js";
import { generateDigestBlockContent } from "../../../jobs/digest/digest.utils.js";
jest.mock("../../../jobs/digest/digest.utils.js", () => ({
    generateDigestBlockContent: jest.fn(),
}));
jest.mock("../../../jobs/digest/language.js", () => ({
    getPreferredDigestLanguage: async () => "ar",
}));
jest.mock("./digest-dispatch.mjs", () => ({ enqueueDigestBlock: jest.fn() }));
jest.mock("../models/user.mjs", () => ({
    __esModule: true,
    default: { findById: async () => ({ contextId: "user-context" }) },
}));
let server, owner, ids, tasks;
beforeAll(async () => {
    server = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await mongoose.connect(server.getUri());
});
afterAll(async () => {
    await mongoose.disconnect();
    await server?.stop();
});
beforeEach(async () => {
    await Digest.deleteMany({});
    owner = new mongoose.Types.ObjectId();
    ids = Array.from({ length: 4 }, () => new mongoose.Types.ObjectId());
    tasks = ids.map(() => new mongoose.Types.ObjectId());
    await Digest.create({
        owner,
        blocks: ids.map((_id, i) => ({
            _id,
            title: `Card ${i}`,
            prompt: `Prompt ${i}`,
            content: `Old ${i}`,
            taskId: tasks[i],
        })),
    });
    // Old fields remain in storage without being part of the active schema.
    await Digest.collection.updateOne(
        { owner },
        { $set: { greeting: "Cached greeting" } },
    );
    generateDigestBlockContent.mockImplementation(
        async (block) => `New ${block.title}`,
    );
});
const build = (i) =>
    buildDigestBlock(String(ids[i]), owner, { log: jest.fn() }, tasks[i]);
it("merges simultaneous successful card results on a legacy document without losing either", async () => {
    const results = await Promise.all(ids.map((_, i) => build(i)));
    expect(results.every((result) => result.success)).toBe(true);
    const digest = await Digest.findOne({ owner }).lean();
    expect(digest.blocks.map((b) => b.content)).toEqual(
        ids.map((_, i) => `New Card ${i}`),
    );
    expect(digest.blocks.every((b) => b.taskId === null)).toBe(true);
    expect(digest.greeting).toBe("Cached greeting");
    expect(digest.blocksRevision).toBe(4);
});
it.each(["edit", "delete", "replace-task", "delete-digest"])(
    "discards a late result after %s",
    async (action) => {
        generateDigestBlockContent.mockImplementation(async () => {
            if (action === "delete-digest") await Digest.deleteOne({ owner });
            else
                await updateDigestBlocks(owner, (blocks) => {
                    if (action === "delete") return blocks.slice(1);
                    if (action === "edit") {
                        blocks[0].prompt = "Edited";
                        blocks[0].generationKey = "new";
                    }
                    if (action === "replace-task")
                        blocks[0].taskId = new mongoose.Types.ObjectId();
                    return blocks;
                });
            return "obsolete";
        });
        expect(await build(0)).toMatchObject({ success: true, skipped: true });
        const digest = await Digest.findOne({ owner }).lean();
        expect(
            digest?.blocks.some((b) => b.content === "obsolete") || false,
        ).toBe(false);
    },
);
it("preserves failed cleanup safeguards with a simultaneous edit and another result", async () => {
    generateDigestBlockContent.mockImplementation(async (block) => {
        if (String(block._id) !== String(ids[0])) return "other new result";
        await updateDigestBlocks(owner, (blocks) => {
            blocks[0].title = "Renamed";
            return blocks;
        });
        throw new Error("Provider failed");
    });
    const [failed] = await Promise.all([build(0), build(1)]);
    expect(failed.success).toBe(false);
    const digest = await Digest.findOne({ owner }).lean();
    expect(digest.blocks[0]).toMatchObject({
        title: "Renamed",
        content: "Old 0",
        taskId: null,
    });
    expect(digest.blocks[1].content).toBe("other new result");
});
