import { compactDigestBlocks } from "../../../jobs/digest/content-storage.js";
import Digest from "../models/digest.mjs";

export const plainBlock = (block) =>
    block.toObject ? block.toObject() : { ...block };

// blocks is encrypted as ONE value. All writers must reread and replace it
// with a plaintext revision predicate; Mongo cannot update encrypted children.
export async function updateDigestBlocks(owner, transform) {
    for (let attempt = 0; attempt < 8; attempt++) {
        const current = await Digest.findOne({ owner });
        if (!current) return null;
        const blocks = await transform(current.blocks.map(plainBlock), current);
        if (!blocks) return current;
        const saved = await Digest.findOneAndUpdate(
            {
                _id: current._id,
                owner,
                blocksRevision: current.blocksRevision ?? { $exists: false },
                // Also fence writes from workers running the previous release.
                updatedAt: current.updatedAt || { $exists: false },
            },
            {
                $set: { blocks: compactDigestBlocks(blocks) },
                $inc: { blocksRevision: 1 },
            },
            { new: true },
        );
        if (saved) return saved;
    }
    throw new Error("Digest changed concurrently; please retry");
}

export function sameDigestGeneration(a, b) {
    return (
        a &&
        b &&
        String(a._id) === String(b._id) &&
        a.prompt === b.prompt &&
        a.generationKey === b.generationKey &&
        !a.automationId &&
        !b.automationId
    );
}

export function mergeDigestEdit(current, requested) {
    return requested.map((entry) => {
        const previous = current.find(
            (block) => String(block._id) === String(entry._id),
        );
        const changed =
            !previous ||
            previous.prompt !== entry.prompt ||
            String(previous.automationId || "") !==
                String(entry.automationId || "");
        return {
            ...previous,
            _id: entry._id,
            title: entry.title,
            prompt: entry.prompt,
            automationId: entry.automationId || null,
            ...(changed
                ? { generationKey: entry.generationKey, taskId: null }
                : {}),
            ...(entry.automationId
                ? { content: null, updatedAt: null, taskId: null }
                : {}),
        };
    });
}
