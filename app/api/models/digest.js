import mongoose from "mongoose";

// Define the User schema
const digestSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        blocks: [
            {
                title: {
                    type: String,
                    required: true,
                },
                prompt: {
                    type: String,
                    required: true,
                },
                content: {
                    type: String,
                    required: false,
                },
                updatedAt: {
                    type: Date,
                    required: false,
                },
            },
        ],
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
        },
    },
);

// add index on owner
digestSchema.index({ owner: 1 });

// Create the User model from the schema
const Digest = mongoose.models.Digest || mongoose.model("Digest", digestSchema);

export default Digest;
