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

    async handleCompletion(taskId, dataObject, metadata, client) {
        console.log("[CodingTask] Starting handleCompletion", {
            taskId,
            metadata,
        });

        const { chatId } = metadata;
        if (!chatId) {
            console.error("[CodingTask] Missing chatId in metadata");
            throw new Error("Chat ID is required in metadata");
        }

        console.log("[CodingTask] Retrieving chat to check message position", {
            chatId,
            taskId,
        });

        // Find the chat and check if the task message is the last one
        const chat = await Chat.findOne({
            _id: chatId,
            "messages.taskId": taskId,
        });

        if (!chat) {
            console.error("[CodingTask] Chat not found or message not in chat");
            throw new Error("Chat not found or message not in chat");
        }

        // Find the index of the task message
        const taskMessageIndex = chat.messages.findIndex(
            (msg) => msg.taskId === taskId,
        );
        const isLastMessage = taskMessageIndex === chat.messages.length - 1;

        // Update the message in the messages array in memory first
        chat.messages[taskMessageIndex].payload = dataObject;
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

        if (!isLastMessage) {
            // If it's not the last message, we need to fetch the chat again to get the updated messages
            const updatedChat = await Chat.findById(chatId);

            // Create a new message to add
            const newMessage = {
                payload: `Your coding task is now complete. [Click here](#message-${taskMessageIndex >= 0 ? chat.messages[taskMessageIndex]._id : taskId}) to see your result.`,
                sender: "labeeb",
                tool: null,
                sentTime: new Date().toISOString(),
                direction: "incoming",
                position: "single",
                isServerGenerated: true,
            };

            // Add the new message to the array
            updatedChat.messages.push(newMessage);

            // Save the entire chat object again
            await Chat.findOneAndUpdate(
                { _id: chatId },
                { $set: { messages: updatedChat.messages } },
            );
        }

        console.log("[CodingTask] Successfully completed handling", { chatId });
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
