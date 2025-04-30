import mongoose from "mongoose";

// Define the Workspace schema
export const appletSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        html: {
            type: String,
            required: false,
        },
        htmlVersions: [{
            content: {
                type: String,
                required: true,
            },
            timestamp: {
                type: Date,
                default: Date.now,
            }
        }],
        messages: [
            {
                role: {
                    type: String,
                    required: true,
                },
                content: {
                    type: String,
                    required: true,
                },
            },
        ],
        suggestions: [
            {
                name: {
                    type: String,
                    required: true,
                },
                uxDescription: {
                    type: String,
                    required: true,
                },
            },
        ],
        name: {
            type: String,
            required: false,
        },
    },
    {
        timestamps: true,
    },
);

// add index on owner
appletSchema.index({ owner: 1 });

// Create the Workspace model from the schema
const Applet = mongoose.models.Applet || mongoose.model("Applet", appletSchema);

export default Applet;
