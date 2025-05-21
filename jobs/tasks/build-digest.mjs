import { buildDigestBlock } from "../digest-build.js";
import { BaseTask } from "./base-task.mjs";

class BuildDigestTask extends BaseTask {
    constructor(taskId) {
        super(taskId);
    }

    get displayName() {
        return "Build digest block";
    }

    async startRequest(job) {
        const { userId, taskId } = job.data;
        const { blockId } = job.data.metadata;

        if (!userId) {
            throw new Error("User ID is required in metadata");
        }

        // Create a logger object for the digest build
        const logger = {
            log: (message, ...args) => {
                console.log(`[BuildDigestTask] ${message}`, ...args);
            },
        };

        // Start the digest build process
        await buildDigestBlock(blockId, userId, logger, taskId);

        return; // after this is done, no need to track anything else
    }
}

export default new BuildDigestTask();
