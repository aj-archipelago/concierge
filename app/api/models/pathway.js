import mongoose from "mongoose";

// Function to generate a random string
export function generateRandomString() {
    return crypto.randomUUID();
}

// Define the pathway schema
const pathwaySchema = new mongoose.Schema({
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    name: {
        type: String,
        required: true,
    },
    model: {
        type: String,
        required: true,
    },
    secret: {
        type: String,
        required: true,
    },
});

// create index on user
pathwaySchema.index({ owner: 1 });
pathwaySchema.index({ createdAt: -1 });

// Create the User model from the schema
const Pathway =
    mongoose.models.Pathway || mongoose.model("Pathway", pathwaySchema);

export default Pathway;
