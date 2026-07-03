export default async function globalTeardown() {
    try {
        const mongoose = (await import("mongoose")).default;
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    } catch {
        // Ignore teardown errors so Jest can exit cleanly.
    }
}
