import Redis from "ioredis";

let connection = null;

export function getRedisConnection() {
    if (!connection) {
        connection = new Redis(
            process.env.REDIS_CONNECTION_STRING || "redis://localhost:6379",
            {
                maxRetriesPerRequest: null,
            },
        );
    }
    return connection;
}

// Only the worker process lifecycle calls this, after all consumers drain.
export async function closeRedisConnection() {
    if (connection) {
        await connection.quit();
        connection = null;
    }
}
