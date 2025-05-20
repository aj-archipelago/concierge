import { BaseTask } from "./base-task.mjs";
import {
    buildDigestForSingleUser,
} from "../digest-build.js";
import Task from "../../app/api/models/task.mjs";

class BuildDigestTask extends BaseTask {
    constructor(taskId) {
        super(taskId);
    }

    get displayName() {
        return "Build Digest task";
    }

    async startRequest(job) {
        const { userId, taskId } = job.data;
        const { blockId } = job.data.metadata;

        console.log("build digest task", job.data, job.data.metadata);

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
        await buildDigestForSingleUser(userId, logger, job, taskId);

        return; // after this is done, no need to track anything else
    }

    async handleCompletion(taskId, dataObject, metadata, client) {
        console.log("[BuildDigestTask] Starting handleCompletion", {
            taskId,
            metadata,
        });

        const task = await Task.findById(taskId);
        if (!task) {
            throw new Error("Task not found");
        }

        // Update the task with completion status
        await Task.findOneAndUpdate(
            { _id: taskId },
            {
                status: "completed",
                progress: 1,
                data: dataObject || {
                    message: "Digest build completed successfully",
                },
            },
        );

        return dataObject;
    }

    async cancelRequest(taskId, client) {
        // For digest building, we can't really cancel the process
        // as it's a one-time operation. We'll just mark the task as cancelled.
        await Task.findOneAndUpdate({ _id: taskId }, { status: "cancelled" });
        return taskId;
    }
}

export default new BuildDigestTask();
