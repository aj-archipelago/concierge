#!/usr/bin/env node
// Set MONGO_URI in the environment. Default: inspect only; --apply adds indexes.
import { MongoClient } from "mongodb";
export const USAGE_INDEXES = [
    {
        collection: "token_usage",
        key: { api_key_id: 1 },
        options: { name: "api_key_id_1", background: true },
    },
    {
        collection: "api_key_cost_periods",
        key: { expiresAt: 1 },
        options: {
            name: "expiresAt_1",
            expireAfterSeconds: 0,
            background: true,
        },
    },
];
async function main() {
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
    const client = new MongoClient(process.env.MONGO_URI, {
        maxPoolSize: 1,
        serverSelectionTimeoutMS: 10_000,
    });
    try {
        await client.connect();
        for (const spec of USAGE_INDEXES) {
            const collection = client.db().collection(spec.collection);
            const existing = await collection
                .listIndexes()
                .toArray()
                .catch((error) => {
                    if (error.code === 26) return [];
                    throw error;
                });
            const found = existing.find(
                (index) =>
                    JSON.stringify(index.key) === JSON.stringify(spec.key),
            );
            if (
                found &&
                spec.options.expireAfterSeconds !== undefined &&
                found.expireAfterSeconds !== spec.options.expireAfterSeconds
            )
                throw new Error(
                    `Conflicting TTL for ${spec.collection}.${found.name}`,
                );
            if (!found && process.argv.includes("--apply"))
                await collection.createIndex(spec.key, spec.options);
            console.log(
                JSON.stringify({
                    collection: spec.collection,
                    key: spec.key,
                    state: found
                        ? "exists"
                        : process.argv.includes("--apply")
                          ? "created"
                          : "missing",
                }),
            );
        }
    } finally {
        await client.close();
    }
}
if (process.argv[1]?.endsWith("ensure-usage-indexes.mjs"))
    main().catch((error) => {
        console.error("Usage index setup failed", {
            name: error.name,
            code: error.code,
        });
        process.exitCode = 1;
    });
