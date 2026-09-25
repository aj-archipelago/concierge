import mongoose from "mongoose";
import { MongoClient } from "mongodb";
import { messageSchema } from "./message.mjs";

const CHAT_MESSAGE_COLLECTION = "chat_messages";
const CHAT_MESSAGE_INDEXES = [
    { key: { chatId: 1, generationId: 1, sequence: 1 } },
    { key: { chatId: 1, generationId: 1, messageId: 1 } },
    {
        key: { chatId: 1, generationId: 1, taskId: 1 },
        sparse: true,
    },
];

const chatMessageSchema = new mongoose.Schema(
    {
        chatId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Chat",
            required: true,
        },
        generationId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        sequence: {
            type: Number,
            required: true,
        },
        messageId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        taskId: {
            type: mongoose.Schema.Types.ObjectId,
            default: undefined,
        },
        message: {
            type: messageSchema,
            required: true,
        },
    },
    {
        collection: CHAT_MESSAGE_COLLECTION,
        timestamps: true,
        autoIndex: false,
    },
);

for (const { key, ...options } of CHAT_MESSAGE_INDEXES) {
    chatMessageSchema.index(key, options);
}

const ChatMessage =
    mongoose.models?.ChatMessage ||
    mongoose.model("ChatMessage", chatMessageSchema);

export default ChatMessage;

function usesCosmosMongo() {
    try {
        return new URL(process.env.MONGO_URI).hostname.endsWith(
            ".cosmos.azure.com",
        );
    } catch {
        return false;
    }
}

export async function ensureChatMessageStorage() {
    if (!usesCosmosMongo()) {
        await ChatMessage.createIndexes();
        return;
    }

    // Cosmos collection management uses custom commands that the CSFLE wrapper
    // deliberately rejects. Provision through a short-lived plain client while
    // keeping all application reads and writes on the encrypted Mongoose client.
    const client = new MongoClient(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 30_000,
        socketTimeoutMS: 45_000,
        connectTimeoutMS: 30_000,
        maxPoolSize: 1,
    });

    try {
        await client.connect();
        const db = client.db();
        const exists = await db
            .listCollections(
                { name: CHAT_MESSAGE_COLLECTION },
                { nameOnly: true },
            )
            .hasNext();
        if (!exists) {
            const maxThroughput = Number(
                process.env.CHAT_MESSAGES_AUTOSCALE_MAX_RU || 5000,
            );
            if (
                !Number.isInteger(maxThroughput) ||
                maxThroughput < 1000 ||
                maxThroughput % 1000 !== 0
            ) {
                throw new Error(
                    "CHAT_MESSAGES_AUTOSCALE_MAX_RU must be a multiple of 1000 and at least 1000",
                );
            }
            await db.command({
                customAction: "CreateCollection",
                collection: CHAT_MESSAGE_COLLECTION,
                shardKey: "chatId",
                autoScaleSettings: { maxThroughput },
            });
        }

        const metadata = await db.command({
            customAction: "GetCollection",
            collection: CHAT_MESSAGE_COLLECTION,
        });
        const shardFields = Object.keys(metadata?.shardKeyDefinition || {});
        if (!shardFields.includes("chatId")) {
            throw new Error(
                `${CHAT_MESSAGE_COLLECTION} must be partitioned by chatId`,
            );
        }
        await db
            .collection(CHAT_MESSAGE_COLLECTION)
            .createIndexes(CHAT_MESSAGE_INDEXES);
    } finally {
        await client.close();
    }
}
