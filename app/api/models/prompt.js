import mongoose from "mongoose";

// Define the Prompt schema
const promptSchema = new mongoose.Schema({
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    title: {
        type: String,
        required: true,
    },
    text: {
        type: String,
        required: true,
    },
    llm: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LLM",
    },
});

// create index on user
promptSchema.index({ owner: 1 });
promptSchema.index({ createdAt: -1 });
promptSchema.index({ llm: 1 });

// Create the User model from the schema
const Prompt =
    mongoose.models?.Prompt || mongoose.model("Prompt", promptSchema);

export default Prompt;
