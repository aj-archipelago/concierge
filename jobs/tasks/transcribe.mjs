import mongoose from "mongoose";
import { connectToDatabase } from "../../src/db.mjs";
import { FORMAT_PARAGRAPH_TURBO } from "../graphql.mjs";
import { BaseTask } from "./base-task.mjs";
import { getStoredTranscriptFormat } from "./transcribe-format.mjs";
import { getTranscribeQueryForModelOption } from "./transcribe-query.mjs";
import { applyTranscriptionCompletionToState } from "./transcribe-state.mjs";
import { normalizeTranscribeTaskMetadata } from "../../app/api/utils/transcribe-model-options.js";
import {
    redactObjectForLog,
    redactSensitiveText,
    redactUrlForLog,
} from "../../app/api/utils/log-redaction.mjs";
import { validatePublicMediaUrl } from "../../app/api/utils/publicMediaUrlValidation.js";
// Update model imports to use dynamic import since they're ES modules
let User, UserState, Task;
const activeTaskStatusFilter = {
    $nin: ["completed", "failed", "cancelled", "abandoned"],
};

function getTranscriptionBackendError(dataObject) {
    const text =
        typeof dataObject === "string"
            ? dataObject
            : typeof dataObject?.data === "string"
              ? dataObject.data
              : typeof dataObject?.error === "string"
                ? dataObject.error
                : typeof dataObject?.message === "string"
                  ? dataObject.message
                  : "";
    const prefix = "transcribe error:";
    const trimmed = text.trim();
    if (!trimmed.toLowerCase().startsWith(prefix)) return null;
    return trimmed.slice(prefix.length).trim() || null;
}

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
        const normalizedMetadata = normalizeTranscribeTaskMetadata(metadata);
        console.debug(
            `[TranscribeHandler] Initializing job ${taskId}`,
            redactObjectForLog(normalizedMetadata),
        );

        let {
            url,
            language,
            wordTimestamped,
            responseFormat,
            maxLineCount,
            maxLineWidth,
            maxWordsPerLine,
            highlightWords,
            modelOption,
            contextId,
        } = normalizedMetadata;

        if (metadata.enforcePublicUrl) {
            const validation = await validatePublicMediaUrl(url, {
                validateRedirects: true,
            });
            if (!validation.ok) {
                console.debug(
                    `[TranscribeHandler] Public URL validation failed for ${redactUrlForLog(url)}`,
                );
                throw new Error(`Invalid URL: ${redactUrlForLog(url)}`);
            }
            url = validation.url;
        } else {
            try {
                new URL(url);
            } catch (error) {
                console.debug(
                    `[TranscribeHandler] URL validation failed for ${redactUrlForLog(url)}`,
                );
                throw new Error(`Invalid URL: ${redactUrlForLog(url)}`);
            }
        }

        // Select query based on model option
        console.debug(
            `[TranscribeHandler] Selected model option: ${modelOption}`,
        );
        const query = getTranscribeQueryForModelOption(modelOption);

        console.debug(`[TranscribeHandler] Sending transcription request`, {
            url: redactUrlForLog(url),
            language,
            modelOption,
            responseFormat,
            hasContextId: !!contextId,
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
                contextId,
            },
            fetchPolicy: "no-cache",
        });

        if (errors) {
            const redactedErrors = redactSensitiveText(JSON.stringify(errors));
            console.debug(
                `[TranscribeHandler] GraphQL errors encountered`,
                redactedErrors,
            );
            throw new Error(`GraphQL errors: ${redactedErrors}`);
        }

        const result =
            data?.transcribe?.result ||
            data?.transcribe_neuralspace?.result ||
            data?.transcribe_gemini?.result ||
            data?.transcribe_mai_15?.result ||
            data?.transcribe_xai_gemini?.result ||
            data?.transcribe_xai?.result;

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

    async handleCompletion(taskId, dataObject, infoObject, metadata, client) {
        console.debug(`[TranscribeHandler] Handling completion for ${taskId}`, {
            format: metadata.responseFormat,
            hasData: !!dataObject,
        });

        const backendError = getTranscriptionBackendError(dataObject);
        if (backendError) {
            throw new Error(`Transcription failed: ${backendError}`);
        }

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

        if (!metadata.skipUserState) {
            const { userId } = metadata;
            await this.handleTranscriptionCompletion(
                userId,
                finalTranscript,
                metadata.responseFormat,
                { ...metadata, taskId },
            );
            console.debug(
                `[TranscribeHandler] Transcript saved to user state for ${userId}`,
            );
        }

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
            if (!User || !UserState || !Task) {
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

            const { url } = metadata || {};
            console.debug(
                `[TranscribeHandler] Adding transcript for video ${redactUrlForLog(url)}`,
            );

            const storedFormat = getStoredTranscriptFormat(format);
            const result = applyTranscriptionCompletionToState({
                state,
                transcriptionData,
                storedFormat,
                metadata,
            });

            if (!result.applied) {
                console.warn(
                    `[TranscribeHandler] Skipping transcript save because the active video changed before completion`,
                    { target: redactUrlForLog(url) },
                );
                return;
            }

            if (metadata?.taskId) {
                const activeTask = await Task.findOne({
                    _id: metadata.taskId,
                    status: activeTaskStatusFilter,
                }).select("_id");

                if (!activeTask) {
                    console.warn(
                        `[TranscribeHandler] Skipping transcript save because task is already terminal`,
                        { taskId: metadata.taskId },
                    );
                    return;
                }
            }

            // Save the updated state
            userState.serializedState = JSON.stringify(result.state);
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

const transcribeHandler = new TranscribeHandler();

export default transcribeHandler;
