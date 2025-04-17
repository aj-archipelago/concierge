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
