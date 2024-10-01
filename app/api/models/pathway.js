import mongoose from "mongoose";

// Function to generate a random string
export function generateRandomString(length = 32) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
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
    secret: {
        type: String,
        required: true,
        default: generateRandomString,
    },
});

// create index on user
pathwaySchema.index({ owner: 1 });
pathwaySchema.index({ createdAt: -1 });

// Create the User model from the schema
const Pathway = mongoose.models.Pathway || mongoose.model("Pathway", pathwaySchema);

export default Pathway;
