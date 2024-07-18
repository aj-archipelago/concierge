import mongoose from "mongoose";

const userStateSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        write: {
            headline: {
                type: String,
            },
            subhead: {
                type: String,
            },
            text: {
                type: String,
            },
        },
        translate: {
            inputText: {
                type: String,
            },
            translationStrategy: {
                type: String,
            },
            translationLanguage: {
                type: String,
            },
            translatedText: {
                type: String,
            },
        },
        transcribe: {
            url: {
                type: String,
            },
            outputFormat: {
                type: String,
            },
            transcriptionType: {
                type: String,
            },
            language: {
                type: String,
            },
            maxLineWidth: {
                type: Number,
            },
            maxLineCount: {
                type: Number,
            },
            model: {
                type: String,
            },
            wordTimestamped: {
                type: Boolean,
            },
            textFormatted: {
                type: Boolean,
            },
        },
        jira: {
            input: {
                type: String,
            },
        },
    },
    {
        timestamps: true,
    },
);

// add index on owner
userStateSchema.index({ user: 1 });

// Create the UserState model from the schema
const UserState =
    mongoose.models.UserState || mongoose.model("UserState", userStateSchema);

export default UserState;
