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
});

// create index on user
promptSchema.index({ owner: 1 });

// Create the User model from the schema
const Prompt = mongoose.models.Prompt || mongoose.model("Prompt", promptSchema);

export default Prompt;
