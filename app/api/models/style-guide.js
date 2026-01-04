import mongoose from "mongoose";

// Define the StyleGuide schema
const styleGuideSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            required: false,
            trim: true,
        },
        file: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "File",
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    {
        timestamps: true,
    },
);

// Create indexes for efficient lookups
styleGuideSchema.index({ uploadedBy: 1 });
styleGuideSchema.index({ isActive: 1 });
styleGuideSchema.index({ createdAt: -1 });

// Create the StyleGuide model from the schema
const StyleGuide =
    mongoose.models?.StyleGuide ||
    mongoose.model("StyleGuide", styleGuideSchema);

export default StyleGuide;
