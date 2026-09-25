import mongoose from "mongoose";
import { taskSchema } from "./task.mjs";

const validatePayload = (value) =>
    typeof value === "string" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"));

export const messageSchema = new mongoose.Schema(
    {
        payload: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
            validate: [
                validatePayload,
                "Payload should be a string or an array of strings",
            ],
        },
        sender: { type: String, required: true },
        tool: { type: String, default: null },
        sentTime: { type: String, required: true },
        direction: { type: String, required: true },
        position: { type: String, required: true },
        entityId: { type: String, default: null },
        taskId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Task",
            default: null,
        },
        task: taskSchema,
        isServerGenerated: { type: Boolean, default: false },
        ephemeralContent: { type: String, default: null },
        thinkingDuration: { type: Number, default: 0 },
        toolCalls: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    { timestamps: true },
);
