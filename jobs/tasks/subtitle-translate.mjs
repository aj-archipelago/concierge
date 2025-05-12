import mongoose from "mongoose";
import { connectToDatabase } from "../../src/db.mjs";
import { TRANSLATE_GPT4 } from "../graphql.mjs";
import { BaseTask } from "./base-task.mjs";

// Update model imports to use dynamic import since they're ES modules
let User, UserState, Task;

// Initialize models asynchronously
async function initializeModels() {
    const userModule = await import("../../app/api/models/user.mjs");
    const userStateModule = await import("../../app/api/models/user-state.mjs");
    const requestProgressModule = await import("../../app/api/models/task.mjs");

    User = userModule.default;
    UserState = userStateModule.default;
    Task = requestProgressModule.default;
}

class SubtitleTranslateHandler extends BaseTask {
    constructor() {
        super();
        // Initialize models when the handler is instantiated
        initializeModels().catch((error) => {
            console.error(
                "[SubtitleTranslateHandler] Error initializing models:",
                error,
            );
        });
    }

    get displayName() {
        return "Subtitle translation";
    }

    get isRetryable() {
        return true;
    }

    async startRequest(job) {
        const { taskId, metadata } = job.data;
        console.debug(`[SubtitleTranslateHandler] Initializing job ${taskId}`);

        const { text, to, format } = metadata;

        // Select query based on model option
        let query;
        console.debug(`[SubtitleTranslateHandler] Selected model option: GPT4`);
        query = TRANSLATE_GPT4;

        console.debug(
            `[SubtitleTranslateHandler] Sending translation request`,
            {
                to,
                format,
            },
        );

        const { data, errors } = await job.client.query({
            query,
            variables: {
                text,
                to,
                format,
                async: true,
            },
            fetchPolicy: "no-cache",
        });

        if (errors) {
            console.debug(
                `[SubtitleTranslateHandler] GraphQL errors encountered`,
                errors,
            );
            throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
        }

        const result = data?.translate_gpt4?.result;

        if (!result) {
            console.debug(
                `[SubtitleTranslateHandler] No result returned from service`,
                data,
            );
            throw new Error("No result returned from translation service");
        }

        console.debug(
            `[SubtitleTranslateHandler] Job initialized successfully`,
            {
                taskId,
            },
        );
        return result;
    }

    async handleCompletion(taskId, dataObject, metadata, client) {
        console.debug(
            `[SubtitleTranslateHandler] Handling completion for ${taskId}`,
            {
                format: metadata.format,
                hasData: !!dataObject,
            },
        );

        // Save translation to user state
        try {
            const { userId } = metadata;
            await this.handleTranslationCompletion(
                userId,
                dataObject,
                metadata.format,
                metadata,
            );
            console.debug(
                `[SubtitleTranslateHandler] Translation saved to user state for ${userId}`,
            );
        } catch (error) {
            console.error(
                `[SubtitleTranslateHandler] Error saving translation to state:`,
                error,
            );
            // Don't throw the error as we still want to return the translation
        }

        return dataObject;
    }

    async handleTranslationCompletion(
        userId,
        translationData,
        format,
        metadata,
    ) {
        try {
            // Ensure models are initialized
            if (!User || !UserState) {
                await initializeModels();
            }

            // Ensure database connection
            if (mongoose.connection.readyState !== 1) {
                await connectToDatabase();
            }

            console.debug(
                `[SubtitleTranslateHandler] Handling translation completion for user ${userId}`,
            );

            // Get the user
            const user = await User.findById(userId);
            if (!user) {
                console.error(`User ${userId} not found`);
                return;
            }

            // Get the user state
            let userState = await UserState.findOne({ user: userId });
            if (!userState) {
                console.debug(
                    `[SubtitleTranslateHandler] Creating new UserState for user ${userId}`,
                );
                userState = new UserState({ user: userId });
            }

            // Parse the serialized state or initialize an empty object
            let state = {};
            if (userState.serializedState) {
                try {
                    state = JSON.parse(userState.serializedState);
                } catch (error) {
                    console.error("Error parsing serialized state:", error);
                    state = {};
                }
            }

            const transcribeState = state.transcribe || {};
            const transcripts = transcribeState.transcripts || [];

            // Add the new translation
            const updatedTranscripts = [
                ...transcripts,
                {
                    text: translationData,
                    format: format || "vtt",
                    name: metadata.name,
                    timestamp: new Date().toISOString(),
                },
            ];

            // Set the active transcript to the new one
            const newActiveIndex = updatedTranscripts.length - 1;

            // Update the state
            const updatedState = {
                ...state,
                transcribe: {
                    ...transcribeState,
                    transcripts: updatedTranscripts,
                    activeTranscript: newActiveIndex,
                },
            };

            // Save the updated state
            userState.serializedState = JSON.stringify(updatedState);
            await userState.save();

            console.debug(
                `[SubtitleTranslateHandler] Successfully added translation for user ${userId}`,
            );
        } catch (error) {
            console.error(
                "[SubtitleTranslateHandler] Error handling translation completion:",
                error,
            );
            throw error;
        }
    }

    async getUserTranslationJobs(userId) {
        try {
            // Ensure models are initialized
            if (!Task) {
                await initializeModels();
            }

            if (mongoose.connection.readyState !== 1) {
                await connectToDatabase();
            }

            const jobs = await Task.find({
                owner: userId,
                type: "subtitle-translate",
            }).sort({ createdAt: -1 });

            return jobs;
        } catch (error) {
            console.error(
                "[SubtitleTranslateHandler] Error getting user translation jobs:",
                error,
            );
            throw error;
        }
    }
}

export default new SubtitleTranslateHandler();
