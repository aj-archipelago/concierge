import mongoose from "mongoose";

export const DigestGenerationStatus = {
    PENDING: "pending",
    IN_PROGRESS: "in_progress",
    SUCCESS: "success",
    FAILURE: "failure",
};

// Define the User schema
const digestSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        greeting: {
            type: String,
            required: false,
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
                state: {
                    jobId: {
                        type: String,
                        required: false,
                    },
                    status: {
                        type: String,
                        required: false,
                        enum: Object.values(DigestGenerationStatus),
                        default: DigestGenerationStatus.PENDING,
                    },
                    error: {
                        type: String,
                        required: false,
                    },
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
