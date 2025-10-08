import mongoose from "mongoose";
import { connectToDatabase } from "../../src/db.mjs";
import {
    FORMAT_PARAGRAPH_TURBO,
    TRANSCRIBE,
    TRANSCRIBE_GEMINI,
    TRANSCRIBE_NEURALSPACE,
} from "../graphql.mjs";
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

class TranscribeHandler extends BaseTask {
    constructor() {
        super();
        // Initialize models when the handler is instantiated
        initializeModels().catch((error) => {
            console.error(
                "[TranscribeHandler] Error initializing models:",
                error,
            );
        });
    }

    get displayName() {
        return "Video transcription";
    }

    get isRetryable() {
        return true;
    }

    async startRequest(job) {
        const { taskId, metadata } = job.data;
        console.debug(
            `[TranscribeHandler] Initializing job ${taskId}`,
            metadata,
        );

        const {
            url,
            language,
            wordTimestamped,
            responseFormat,
            maxLineCount,
            maxLineWidth,
            maxWordsPerLine,
            highlightWords,
            modelOption,
        } = metadata;

        // Validate URL
        try {
            new URL(url);
        } catch (error) {
            console.debug(
                `[TranscribeHandler] URL validation failed for ${url}`,
            );
            throw new Error(`Invalid URL: ${url}`);
        }

        // Select query based on model option
        let query;
        console.debug(
            `[TranscribeHandler] Selected model option: ${modelOption}`,
        );
        switch (modelOption?.toLowerCase()) {
            case "neuralspace":
                query = TRANSCRIBE_NEURALSPACE;
                break;
            case "gemini":
                query = TRANSCRIBE_GEMINI;
                break;
            default:
                query = TRANSCRIBE;
        }

        console.debug(`[TranscribeHandler] Sending transcription request`, {
            url,
            language,
            modelOption,
            responseFormat,
        });

        const { data, errors } = await job.client.query({
            query,
            variables: {
                file: url,
                language,
                wordTimestamped,
                responseFormat:
                    responseFormat !== "formatted" ? responseFormat : null,
                maxLineCount,
                maxLineWidth,
                maxWordsPerLine,
                highlightWords,
                async: true,
            },
            fetchPolicy: "no-cache",
        });

        if (errors) {
            console.debug(
                `[TranscribeHandler] GraphQL errors encountered`,
                errors,
            );
            throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
        }

        const result =
            data?.transcribe?.result ||
            data?.transcribe_neuralspace?.result ||
            data?.transcribe_gemini?.result;

        if (!result) {
            console.debug(
                `[TranscribeHandler] No result returned from service`,
                data,
            );
            throw new Error("No result returned from transcription service");
        }

        console.debug(`[TranscribeHandler] Job initialized successfully`, {
            taskId,
        });
        return result;
    }

    async handleCompletion(taskId, dataObject, metadata, client) {
        console.debug(`[TranscribeHandler] Handling completion for ${taskId}`, {
            format: metadata.responseFormat,
            hasData: !!dataObject,
        });

        let finalTranscript = dataObject;
        if (
            metadata.responseFormat === "formatted" &&
            typeof dataObject === "string"
        ) {
            try {
                console.debug(`[TranscribeHandler] Formatting transcript text`);
                const response = await client.query({
                    query: FORMAT_PARAGRAPH_TURBO,
                    variables: {
                        text: dataObject,
                        async: false,
                    },
                });

                if (response.data?.format_paragraph_turbo?.result) {
                    console.debug(`[TranscribeHandler] Formatting successful`);
                    finalTranscript =
                        response.data.format_paragraph_turbo.result;
                }
            } catch (error) {
                console.error("Error formatting transcript:", error);
            }
        }

        // Save transcript to user state
        const { userId } = metadata;
        await this.handleTranscriptionCompletion(
            userId,
            finalTranscript,
            metadata.responseFormat,
            metadata,
        );
        console.debug(
            `[TranscribeHandler] Transcript saved to user state for ${userId}`,
        );

        return finalTranscript;
    }

    async handleTranscriptionCompletion(
        userId,
        transcriptionData,
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
                `[TranscribeHandler] Handling transcription completion for user ${userId}`,
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
                    `[TranscribeHandler] Creating new UserState for user ${userId}`,
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
            const videoInformation = transcribeState.videoInformation || {};
            const transcripts = transcribeState.transcripts || [];

            const { url } = metadata || {};
            console.debug(
                `[TranscribeHandler] Adding transcript for video ${url}`,
            );

            // Create a name for the transcript based on the format
            const name = format === "vtt" ? "Subtitles" : "Transcript";

            // Find existing tracks with the same name and get the highest number
            const baseNameMatch = name.match(/(.*?)(?:\s+\((\d+)\))?$/);
            const baseName = baseNameMatch[1];
            const existingNumbers = transcripts
                .filter((t) => t.name && t.name.startsWith(baseName))
                .map((t) => {
                    const match = t.name.match(
                        new RegExp(`${baseName}\\s+\\((\\d+)\\)$`),
                    );
                    return match ? parseInt(match[1]) : 0;
                });

            // Determine the new name with suffix if needed
            let newName = name;
            if (transcripts.some((t) => t.name === name)) {
                const nextNumber =
                    existingNumbers.length > 0
                        ? Math.max(...existingNumbers) + 1
                        : 1;
                newName = `${baseName} (${nextNumber})`;
            }

            // Add the new transcript
            const updatedTranscripts = [
                ...transcripts,
                {
                    text: transcriptionData,
                    format: format || "vtt",
                    name: newName,
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
                `[TranscribeHandler] Successfully added transcript for user ${userId}`,
            );
        } catch (error) {
            console.error(
                "[TranscribeHandler] Error handling transcription completion:",
                error,
            );
            throw error;
        }
    }

    async getUserTranscriptionJobs(userId) {
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
                type: "transcribe",
            }).sort({ createdAt: -1 });

            return jobs;
        } catch (error) {
            console.error(
                "[TranscribeHandler] Error getting user transcription jobs:",
                error,
            );
            throw error;
        }
    }
}

export default new TranscribeHandler();
