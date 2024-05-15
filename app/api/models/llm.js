import mongoose from "mongoose";

// Define the LLM schema
const llmSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    cortexPathwayName: {
        type: String,
        required: true,
    },
    isDefault: {
        type: Boolean,
        default: false,
    },
});

const LLM = mongoose.models?.LLM || mongoose.model("LLM", llmSchema);

export default LLM;
