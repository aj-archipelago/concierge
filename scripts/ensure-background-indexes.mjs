// Run in the selected deployment environment before activating the new workers.
// Without --apply this prints the additive index plan and opens no connection.
const plan = {
    tasks: [
        {
            // Team pagination sorts by this exact pair in Cosmos DB.
            key: { createdAt: -1, _id: -1 },
            name: "createdAt_-1__id_-1",
        },
        {
            key: { dispatchPending: 1, createdAt: 1 },
            name: "dispatchPending_1_createdAt_1",
        },
        {
            key: { type: 1, status: 1, createdAt: 1 },
            name: "type_1_status_1_createdAt_1",
        },
        {
            key: { owner: 1, automationRefId: 1, type: 1, status: 1 },
            name: "owner_1_automationRefId_1_type_1_status_1",
        },
    ],
    assistantmessages: [
        {
            key: { createdAt: 1, _id: 1 },
            name: "createdAt_1__id_1",
        },
    ],
    automations: [
        {
            // Cosmos requires the compound index to match the sort fields;
            // an equality filter on enabled does not permit an index prefix.
            key: { nextRunAt: 1, _id: 1 },
            name: "nextRunAt_1__id_1",
        },
    ],
};
if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify(plan, null, 2));
} else {
    const { MongoClient } = await import("mongodb");
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
    // Index metadata does not need CSFLE. Index builds can outlive the normal
    // application's 45-second socket timeout, especially on Cosmos DB.
    const client = new MongoClient(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 300000,
    });
    try {
        await client.connect();
        for (const [name, indexes] of Object.entries(plan)) {
            const collection = client.db().collection(name);
            for (const index of indexes) {
                console.log(`Ensuring ${name}.${index.name}`);
                await collection.createIndex(index.key, {
                    name: index.name,
                    maxTimeMS: 240000,
                });
            }
            const installed = await collection.listIndexes().toArray();
            for (const index of indexes) {
                if (
                    !installed.some(
                        (entry) =>
                            entry.name === index.name &&
                            JSON.stringify(entry.key) ===
                                JSON.stringify(index.key),
                    )
                ) {
                    throw new Error(
                        `Index verification failed: ${name}.${index.name}`,
                    );
                }
            }
            console.log(
                `Verified ${indexes.length} background indexes on ${name}`,
            );
        }
    } finally {
        await client.close();
    }
}
