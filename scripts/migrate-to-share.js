#!/usr/bin/env node
/**
 * Backfill the Share collection from legacy chat.isPublic flags.
 *
 *   node scripts/migrate-to-share.js              # write
 *   node scripts/migrate-to-share.js --dry-run    # preview only
 *
 * Idempotent: skips any (entityType, entityId) that already has a Share doc.
 * Leaves chat.isPublic untouched so the resolver's legacy fallback still works
 * during the soak period.
 *
 * Workspace published-to-Cortex flags are intentionally excluded: publishing a
 * workspace to Cortex is unrelated to sharing it with other Concierge users.
 */

import mongoose from "mongoose";
import { connectToDatabase } from "../src/db.mjs";
import Chat from "../app/api/models/chat.mjs";
import Share from "../app/api/models/share.js";

const DRY_RUN = process.argv.includes("--dry-run");

async function migrateOne({ entityType, model, ownerField, legacyField }) {
    const query = { [legacyField]: true };
    const projection = { _id: 1, [ownerField]: 1 };
    const cursor = model.find(query, projection).lean().cursor();

    let created = 0;
    let skipped = 0;
    let missingOwner = 0;

    for await (const doc of cursor) {
        const ownerId = doc[ownerField];
        if (!ownerId) {
            missingOwner++;
            continue;
        }

        const existing = await Share.findOne({
            entityType,
            entityId: doc._id,
        })
            .select({ _id: 1 })
            .lean();

        if (existing) {
            skipped++;
            continue;
        }

        if (DRY_RUN) {
            created++;
            continue;
        }

        await Share.create({
            entityType,
            entityId: doc._id,
            ownerId,
            link: { enabled: true, role: "viewer" },
            recipients: [],
        });
        created++;
    }

    console.log(
        `[${entityType}] ${DRY_RUN ? "would create" : "created"}=${created} skipped=${skipped} missing_owner=${missingOwner}`,
    );
}

async function main() {
    await connectToDatabase();
    console.log(
        `Migrating legacy public flags into Share docs${DRY_RUN ? " (dry run)" : ""}`,
    );

    await migrateOne({
        entityType: "chat",
        model: Chat,
        ownerField: "userId",
        legacyField: "isPublic",
    });

    await mongoose.disconnect();
    console.log("Done.");
}

main().catch(async (err) => {
    console.error("Migration failed:", err);
    try {
        await mongoose.disconnect();
    } catch {}
    process.exit(1);
});
