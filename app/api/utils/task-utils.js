/**
 * Checks if a task should be marked as abandoned and updates it if necessary
 * @param {Object} task - The task document to check
 * @returns {Object} The potentially updated task
 */
export async function checkAndUpdateAbandonedTask(task) {
    if (!task) return task;

    if (
        task.lastHeartbeat &&
        task.status !== "abandoned" &&
        task.status !== "completed" &&
        task.status !== "failed"
    ) {
        const tenSecondsAgo = new Date(Date.now() - 10000); // 10 seconds in milliseconds
        if (new Date(task.lastHeartbeat) < tenSecondsAgo) {
            task.status = "abandoned";
            await task.save();
        }
    }
    return task;
}
