export class BaseTask {
    get displayName() {
        throw new Error("displayName must be implemented by handler");
    }

    async startRequest(job) {
        throw new Error("startRequest must be implemented by handler");
    }

    async handleCompletion(taskId, dataObject, metadata, client) {
        return dataObject; // Default implementation just returns the data
    }

    async cancelRequest(taskId, client) {
        return;
    }
}
