let dbInitialized = false;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;

export async function ensureDbConnection(forceReconnect = false) {
    if (forceReconnect) {
        dbInitialized = false;
    }

    const mongoose = (await import("mongoose")).default;

    if (
        !dbInitialized ||
        !mongoose.connection ||
        mongoose.connection.readyState !== 1
    ) {
        try {
            connectionAttempts++;
            console.log(
                `Connecting to database (attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS})...`,
            );

            const { connectToDatabase } = await import("../src/db.mjs");
            await connectToDatabase();

            await new Promise((resolve) => setTimeout(resolve, 500));

            if (mongoose.connection && mongoose.connection.readyState === 1) {
                console.log("Successfully connected to MongoDB database");
                dbInitialized = true;
                connectionAttempts = 0;
            } else {
                throw new Error(
                    `Failed to establish MongoDB connection, current state: ${mongoose.connection ? mongoose.connection.readyState : "unknown"}`,
                );
            }
        } catch (error) {
            console.error(
                `Failed to connect to database (attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS}):`,
                error,
            );

            if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
                console.error(
                    "Maximum connection attempts reached. Giving up.",
                );
                throw new Error(
                    `Failed to connect to MongoDB after ${MAX_CONNECTION_ATTEMPTS} attempts: ${error.message}`,
                );
            }

            const backoffTime = Math.min(
                1000 * Math.pow(2, connectionAttempts),
                30000,
            );
            console.log(
                `Waiting ${backoffTime / 1000}s before next connection attempt...`,
            );
            await new Promise((resolve) => setTimeout(resolve, backoffTime));

            return ensureDbConnection();
        }
    }
}

export async function closeDbConnectionIfInitialized() {
    if (!dbInitialized) {
        return;
    }

    const { closeDatabaseConnection } = await import("../src/db.mjs");
    await closeDatabaseConnection();
    dbInitialized = false;
}
