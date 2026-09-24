import { MongoClient } from "mongodb";
let databasePromise;
export async function getUsageDatabase() {
    if (!databasePromise) {
        databasePromise = (async () => {
            const uri = process.env.MONGO_URI;
            if (!uri) throw new Error("MONGO_URI is not configured");
            const client = new MongoClient(uri, {
                maxPoolSize: 4,
                serverSelectionTimeoutMS: 10_000,
            });
            try {
                await client.connect();
                return client.db();
            } catch (error) {
                await client.close();
                throw error;
            }
        })().catch((error) => {
            databasePromise = null;
            throw error;
        });
    }
    return databasePromise;
}

let tokenUsageCollection;
export async function getTokenUsageCollection() {
    if (!tokenUsageCollection)
        tokenUsageCollection = (await getUsageDatabase()).collection(
            "token_usage",
        );
    return tokenUsageCollection;
}
