import mongoose from "mongoose";

// Define the LLM schema
const llmSchema = new mongoose.Schema(
    {
        identifier: {
            type: String,
            required: false,
        },
        name: {
            type: String,
            required: true,
        },
        cortexPathwayName: {
            type: String,
            required: true,
        },
        cortexModelName: {
            type: String,
            required: true,
        },
        isDefault: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    },
);

// index the identifier field
llmSchema.index({ identifier: 1 });

const LLM = mongoose.models?.LLM || mongoose.model("LLM", llmSchema);

export default LLM;
