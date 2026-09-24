import { enqueueDigestBlock } from "../app/api/utils/digest-dispatch.mjs";

/**
 * @jest-environment node
 */

import Digest from "../app/api/models/digest.mjs";
import User from "../app/api/models/user.mjs";
import { buildDigestBlock, buildDigestForUser } from "./digest-build.js";
import { generateDigestBlockContent } from "./digest/digest.utils.js";
import { getPreferredDigestLanguage } from "./digest/language.js";

jest.mock("../app/api/utils/digest-dispatch.mjs", () => ({
    enqueueDigestBlock: jest.fn(),
}));
jest.mock("../app/api/models/digest.mjs", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn(),
        findOneAndUpdate: jest.fn(),
    },
}));

jest.mock("../app/api/models/task.mjs", () => ({
    __esModule: true,
    default: { findOneAndUpdate: jest.fn() },
}));

jest.mock("../app/api/models/user.mjs", () => ({
    __esModule: true,
    default: { find: jest.fn(), findById: jest.fn() },
}));

jest.mock("./digest/digest.utils.js", () => ({
    generateDigestBlockContent: jest.fn(),
}));

jest.mock("./digest/language.js", () => ({
    getPreferredDigestLanguage: jest.fn(),
}));

describe("digest build language wiring", () => {
    const logger = { log: jest.fn() };
    const user = {
        _id: "user-1",
        contextId: "context-1",
        contextKey: "context-key-1",
    };

    beforeEach(() => {
        jest.clearAllMocks();
        getPreferredDigestLanguage.mockResolvedValue("ar");
        generateDigestBlockContent.mockResolvedValue("arabic content");
    });

    it("dispatches cards without generating content in the batch", async () => {
        Digest.findOne.mockResolvedValue({
            blocks: [
                { _id: "block-1", prompt: "Daily update" },
                { _id: "linked", automationId: "automation" },
            ],
        });
        await buildDigestForUser(user, logger, { slot: "slot" });
        expect(enqueueDigestBlock).toHaveBeenCalledWith("user-1", "block-1", {
            slot: "slot",
        });
        expect(enqueueDigestBlock).toHaveBeenCalledTimes(1);
        expect(generateDigestBlockContent).not.toHaveBeenCalled();
    });

    it("passes the saved language through a manual block rebuild", async () => {
        const block = {
            _id: "block-1",
            prompt: "Daily update",
            content: "previous content",
        };
        const digest = { blocks: [block] };
        Digest.findOne
            .mockResolvedValueOnce(digest)
            .mockResolvedValueOnce(digest);
        Digest.findOneAndUpdate.mockResolvedValue(digest);
        User.findById.mockResolvedValue(user);

        await buildDigestBlock("block-1", "user-1", logger);

        expect(getPreferredDigestLanguage).toHaveBeenCalledWith(
            "user-1",
            logger,
        );
        expect(generateDigestBlockContent).toHaveBeenCalledWith(
            block,
            user,
            logger,
            expect.any(Function),
            { language: "ar" },
        );
    });
});

describe("digest refresh failures", () => {
    const logger = { log: jest.fn() };
    const user = { _id: "user-1" };
    let digest;
    beforeEach(() => {
        jest.clearAllMocks();
        digest = {
            blocks: [
                {
                    _id: "block-1",
                    content: "Previous report",
                    updatedAt: new Date("2026-09-01"),
                    taskId: "task-1",
                },
            ],
        };
        Digest.findOne.mockResolvedValue(digest);
        Digest.findOneAndUpdate.mockResolvedValue(digest);
        User.findById.mockResolvedValue(user);
        getPreferredDigestLanguage.mockResolvedValue("en");
        generateDigestBlockContent.mockRejectedValue(
            new Error("Gateway timeout"),
        );
    });

    it("preserves scheduled content and its timestamp on failure", async () => {
        await buildDigestForUser(user, logger);
        expect(Digest.findOneAndUpdate).not.toHaveBeenCalled();
        expect(digest.blocks[0]).toMatchObject({
            content: "Previous report",
            updatedAt: new Date("2026-09-01"),
        });
    });

    it("returns failure for a manual refresh without replacing previous content", async () => {
        const result = await buildDigestBlock("block-1", "user-1", logger);
        expect(result.success).toBe(false);
        expect(result.block.content).toBe("Previous report");
        expect(result.block.updatedAt).toEqual(new Date("2026-09-01"));
    });
});

describe("encrypted digest failure cleanup", () => {
    const logger = { log: jest.fn() };
    let stored;
    let beforeWrite;

    beforeEach(() => {
        jest.resetAllMocks();
        beforeWrite = null;
        stored = {
            _id: "digest-1",
            owner: "user-1",
            updatedAt: new Date("2026-09-14T10:00:00Z"),
            blocks: [
                { _id: "block-1", content: "Saved report", taskId: "task-1" },
                { _id: "block-2", content: "Other report", taskId: null },
            ],
        };
        Digest.findOne.mockImplementation(async () => structuredClone(stored));
        Digest.findOneAndUpdate.mockImplementation(async (filter, update) => {
            // The blocks array is one encrypted value. Model the query-analysis
            // boundary as well as the plaintext compare-and-swap predicate.
            if (
                [...Object.keys(filter), ...Object.keys(update.$set)].some(
                    (key) => key.startsWith("blocks."),
                )
            )
                throw new Error("CSFLE rejects encrypted child paths");
            expect(Array.isArray(update.$set.blocks)).toBe(true);
            beforeWrite?.();
            if (filter.updatedAt.getTime() !== stored.updatedAt.getTime())
                return null;
            stored.blocks = structuredClone(update.$set.blocks);
            return structuredClone(stored);
        });
        User.findById.mockResolvedValue({ _id: "user-1" });
        getPreferredDigestLanguage.mockResolvedValue("en");
        generateDigestBlockContent.mockRejectedValue(
            new Error("Original generation failure"),
        );
    });

    const run = () => buildDigestBlock("block-1", "user-1", logger, "task-1");

    it("clears the task with a whole-array write and returns the original failure", async () => {
        const result = await run();
        expect(result).toMatchObject({
            success: false,
            error: "Original generation failure",
        });
        expect(stored.blocks).toEqual([
            { _id: "block-1", content: "Saved report", taskId: null },
            { _id: "block-2", content: "Other report", taskId: null },
        ]);
    });

    it("preserves edits and additions made during generation", async () => {
        generateDigestBlockContent.mockImplementation(async () => {
            stored.blocks[0].prompt = "Edited prompt";
            stored.blocks[1].content = "Newer report";
            stored.blocks.push({ _id: "block-3", content: "New card" });
            throw new Error("Original generation failure");
        });
        await run();
        expect(stored.blocks).toEqual([
            {
                _id: "block-1",
                content: "Saved report",
                prompt: "Edited prompt",
                taskId: null,
            },
            { _id: "block-2", content: "Newer report", taskId: null },
            { _id: "block-3", content: "New card" },
        ]);
    });

    it("re-reads after a concurrent save wins the cleanup race", async () => {
        beforeWrite = () => {
            beforeWrite = null;
            stored.updatedAt = new Date("2026-09-14T10:00:01Z");
            stored.blocks[1].content = "Concurrent edit";
        };
        await run();
        expect(Digest.findOneAndUpdate).toHaveBeenCalledTimes(2);
        expect(stored.blocks[0].taskId).toBeNull();
        expect(stored.blocks[1].content).toBe("Concurrent edit");
    });

    it("does not clear a newer rebuild's task", async () => {
        generateDigestBlockContent.mockImplementation(async () => {
            stored.blocks[0].taskId = "task-2";
            throw new Error("Original generation failure");
        });
        await run();
        expect(stored.blocks[0].taskId).toBe("task-2");
        expect(Digest.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it.each(["block", "digest"])(
        "does not recreate a deleted %s",
        async (deleted) => {
            generateDigestBlockContent.mockImplementation(async () => {
                if (deleted === "digest") stored = null;
                else stored.blocks.shift();
                throw new Error("Original generation failure");
            });
            await expect(run()).resolves.toMatchObject({
                success: false,
                error: "Original generation failure",
            });
            expect(Digest.findOneAndUpdate).not.toHaveBeenCalled();
        },
    );

    it("does not replace the generation error when cleanup storage fails", async () => {
        Digest.findOneAndUpdate.mockRejectedValue(
            new Error("Cleanup storage unavailable"),
        );
        await expect(run()).resolves.toMatchObject({
            success: false,
            error: "Original generation failure",
        });
        expect(logger.log).toHaveBeenCalledWith(
            expect.stringContaining("Cleanup storage unavailable"),
            "user-1",
            "block-1",
        );
    });

    it("bounds cleanup retries when other writers keep winning", async () => {
        Digest.findOneAndUpdate.mockResolvedValue(null);
        await expect(run()).resolves.toMatchObject({
            success: false,
            error: "Original generation failure",
        });
        expect(Digest.findOneAndUpdate).toHaveBeenCalledTimes(8);
    });
});
