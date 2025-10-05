export class BaseTask {
    get displayName() {
        throw new Error("displayName must be implemented by handler");
    }

    get isRetryable() {
        return false;
    }

    async startRequest(job) {
        throw new Error("startRequest must be implemented by handler");
    }

    async handleCompletion(taskId, dataObject, infoObject, metadata, client) {
        return dataObject; // Default implementation just returns the data
    }

    async handleError(taskId, error, metadata, client) {
        // Default implementation does nothing
        return { error: error.message || "Task failed" };
    }

    async cancelRequest(taskId, client) {
        return;
    }
}
