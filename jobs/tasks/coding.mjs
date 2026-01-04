import { BaseTask } from "./base-task.mjs";
import { CODE_HUMAN_INPUT } from "../graphql.mjs";

// Add model import
let Task;
let Chat;

// Initialize models asynchronously
async function initializeModels() {
    const requestProgressModule = await import("../../app/api/models/task.mjs");
    Task = requestProgressModule.default;

    const chatModule = await import("../../app/api/models/chat.mjs");
    Chat = chatModule.default;
}

class CodingTask extends BaseTask {
    constructor() {
        super();
        // Initialize models when handler is instantiated
        initializeModels().catch((error) => {
            console.error("[CodingHandler] Error initializing models:", error);
        });
    }

    get displayName() {
        return "Coding task";
    }

    async startRequest(job) {
        // Coding task is enqueued by cortex, so we don't need
        // to do anything here. Just return the codeRequestId
        // to track progress.
        const { codeRequestId } = job.data.metadata;
        return codeRequestId;
    }

    async handleCompletion(taskId, dataObject, infoObject, metadata, client) {
        console.log("[CodingTask] Starting handleCompletion. Task ID:", taskId);

        const task = await Task.findById(taskId);
        const { chatId } = task.invokedFrom;

        if (!chatId) {
            console.error("[CodingTask] Missing chatId in metadata");
            throw new Error("Chat ID is required in metadata");
        }

        console.log(
            "[CodingTask] Retrieving chat to check message position. Chat ID:",
            chatId,
        );

        // Find the chat and check if the task message is the last one
        const chat = await Chat.findOne({
            _id: chatId,
        });

        if (!chat) {
            console.error("[CodingTask] Chat not found");
            throw new Error("Chat not found");
        }

        // Find the index of the task message
        const taskMessageIndex = chat.messages.findIndex(
            (msg) => msg.taskId?.toString() === taskId.toString(),
        );

        if (taskMessageIndex === -1) {
            console.error("[CodingTask] Task message not found in chat");
            throw new Error("Task message not found in chat");
        }

        // Update the message in the messages array in memory first
        chat.messages[taskMessageIndex].payload =
            dataObject?.message || JSON.stringify(dataObject);
        chat.messages[taskMessageIndex].tool = '{"toolUsed":"coding"}';

        // Then save the entire chat object with modified messages
        await Chat.findOneAndUpdate(
            { _id: chatId },
            {
                $set: {
                    messages: chat.messages,
                    codeRequestId: null,
                    isChatLoading: false,
                },
            },
        );

        console.log(
            "[CodingTask] Successfully completed handling chat ID:",
            chatId,
        );
        return dataObject;
    }

    async cancelRequest(taskId, client) {
        // Send a terminate signal to the coding task in cortex.
        const codeRequestId = (await Task.findById(taskId))?.cortexRequestId;

        await client.query({
            query: CODE_HUMAN_INPUT,
            variables: {
                codeRequestId,
                text: "TERMINATE",
            },
            fetchPolicy: "network-only",
        });

        return codeRequestId;
    }
}

export default new CodingTask();
