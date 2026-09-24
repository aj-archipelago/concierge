import AppletData from "../models/applet-data.js";
import AppletUserData from "../models/applet-user-data.js";
import Task from "../models/task.mjs";

export function backgroundImageUrl(value) {
    const url =
        typeof value === "string"
            ? value
            : value?.azureUrl || value?.url || value?.gcsUrl;
    if (typeof url !== "string") return null;
    try {
        return ["http:", "https:"].includes(new URL(url).protocol) ? url : null;
    } catch {
        return null;
    }
}

/** Reuse legacy per-user image caches before creating a durable keyed task. */
export async function ensureAppletBackgroundImage({
    appletId,
    userId,
    key,
    create,
}) {
    const query = { appletId, userId };
    const [keyed, legacy] = await Promise.all([
        AppletUserData.findOne({ ...query, key }).lean(),
        AppletData.findOne(query).lean(),
    ]);
    const cached = keyed ? keyed.value : legacy?.data?.[key];
    const url = backgroundImageUrl(cached);
    if (url) return { url };

    if (cached?.taskId) {
        // Check ownership again: ordinary applet data is caller-writable.
        const task = await Task.findOne({
            _id: cached.taskId,
            owner: userId,
            "invokedFrom.source": "applet_sdk",
            "invokedFrom.appletId": appletId,
        });
        if (!task) throw new Error("Saved background task is unavailable");
        const completedUrl =
            task.status === "completed" ? backgroundImageUrl(task.data) : null;
        if (completedUrl) {
            // Save the image independently of notification/task retention.
            // This also finalizes generations whose original widget closed.
            const value = { url: completedUrl };
            await AppletUserData.updateOne(
                { ...query, key, "value.taskId": cached.taskId },
                {
                    $set: {
                        value,
                        valueBytes: Buffer.byteLength(JSON.stringify(value)),
                    },
                },
            );
            return { url: completedUrl, taskId: String(task._id) };
        }
        return { taskId: String(task._id) };
    }

    // Errors above deliberately propagate. A failed cache read is never
    // permission to generate. The same key always resumes the same task,
    // including a failed task; changing the key explicitly requests new art.
    const result = await create(`widget-background-v1:${key}`);
    const value = { taskId: String(result.taskId) };
    await AppletUserData.findOneAndUpdate(
        { ...query, key },
        {
            $setOnInsert: {
                ...query,
                key,
                value,
                valueBytes: Buffer.byteLength(JSON.stringify(value)),
            },
        },
        { upsert: true, new: true },
    );
    return { taskId: String(result.taskId) };
}
