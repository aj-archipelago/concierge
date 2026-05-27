import mongoose from "mongoose";

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
                    required: false,
                },
                automationId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Automation",
                    required: false,
                },
                content: {
                    type: String,
                    required: false,
                },
                updatedAt: {
                    type: Date,
                    required: false,
                },
                taskId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Task",
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

// In Next.js dev with HMR, `mongoose.models.Digest` is cached across reloads.
// If the cached schema is missing a newly-added path (e.g. `automationId`),
// silently drop that field on save and break the feature. Force re-registration
// in that case.
const cached = mongoose.models?.Digest;
if (cached && !cached.schema.path("blocks.automationId")) {
    delete mongoose.connection?.models?.Digest;
    delete mongoose.models.Digest;
}

const Digest =
    mongoose.models?.Digest || mongoose.model("Digest", digestSchema);

export default Digest;
