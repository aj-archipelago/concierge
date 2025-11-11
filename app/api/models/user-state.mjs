import mongoose from "mongoose";

const userStateSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        serializedState: {
            type: String,
        },
    },
    {
        timestamps: true,
        optimisticConcurrency: true, // Enable optimistic concurrency control
    },
);

// add index on owner
userStateSchema.index({ user: 1 });

// Create the UserState model from the schema
const UserState =
    mongoose.models?.UserState || mongoose.model("UserState", userStateSchema);

export default UserState;
