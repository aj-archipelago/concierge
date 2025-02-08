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

        // old state model. All fields are now in serializedState.
        // These fields are deprecated, but cannot be removed until
        // all users have been migrated to the new model (to have them
        // work with mongoose).
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
            // encrypted fields are stored as strings
            type: String,
            // url: {
            //     type: String,
            // },
            // videoInformation: {
            //     videoUrl: {
            //         type: String,
            //     },
            //     transcriptionUrl: {
            //         type: String,
            //     },
            //     videoLanguages: {
            //         type: Array,
            //     },
            // },
            // transcripts: {
            //     type: Array,
            // },
            // outputFormat: {
            //     type: String,
            // },
            // transcriptionType: {
            //     type: String,
            // },
            // language: {
            //     type: String,
            // },
            // maxLineWidth: {
            //     type: Number,
            // },
            // maxLineCount: {
            //     type: Number,
            // },
            // model: {
            //     type: String,
            // },
            // wordTimestamped: {
            //     type: Boolean,
            // },
            // textFormatted: {
            //     type: Boolean,
            // },
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
