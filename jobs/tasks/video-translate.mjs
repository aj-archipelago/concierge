import { AZURE_VIDEO_TRANSLATE } from "../graphql.mjs";
import { BaseTask } from "./base-task.mjs";

class VideoTranslateHandler extends BaseTask {
    get displayName() {
        return "Video translation";
    }

    get isRetryable() {
        return true;
    }

    async startRequest(job) {
        const { taskId, metadata } = job.data;

        console.debug(
            `[VideoTranslateHandler] Initializing job ${taskId}`,
            metadata,
        );

        const { sourceLocale, targetLocale, url } = metadata;

        // Validate URL
        try {
            new URL(url);
        } catch (error) {
            console.debug(
                `[VideoTranslateHandler] URL validation failed for ${url}`,
            );
            throw new Error(`Invalid URL: ${url}`);
        }

        console.debug(
            `[VideoTranslateHandler] Sending video translation request`,
            {
                sourceLocale,
                targetLocale,
                url,
            },
        );

        const { data, errors } = await job.client.query({
            query: AZURE_VIDEO_TRANSLATE,
            variables: {
                mode: "uploadvideooraudiofileandcreatetranslation",
                sourcelocale: sourceLocale,
                targetlocale: targetLocale,
                sourcevideooraudiofilepath: url,
                stream: true,
            },
            fetchPolicy: "no-cache",
        });

        if (errors) {
            console.debug(
                `[VideoTranslateHandler] GraphQL errors encountered`,
                errors,
            );
            throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
        }

        const result = data?.azure_video_translate?.result;

        if (!result) {
            console.debug(
                `[VideoTranslateHandler] No result returned from service`,
                data,
            );
            throw new Error("No result returned from translation service");
        }

        console.debug(`[VideoTranslateHandler] Job initialized successfully`, {
            taskId,
        });
        return result;
    }

    async fetchVttContent(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(
                    `Failed to fetch VTT content: ${response.statusText}`,
                );
            }
            return await response.text();
        } catch (error) {
            console.error(`Error fetching VTT content from ${url}:`, error);
            throw error;
        }
    }

    async handleVideoTranslationCompletion(
        userId,
        dataObject,
        targetLocaleLabel,
    ) {
        if (!userId || !dataObject) {
            console.error("User ID or data object is missing");
            throw new Error("User ID or data object is missing");
        }

        try {
            const UserState = (
                await import("../../app/api/models/user-state.mjs")
            ).default;
            const userState = await UserState.findOne({ user: userId });
            if (!userState) {
                throw new Error("User state not found");
            }

            let state = {};
            try {
                state = userState.serializedState
                    ? JSON.parse(userState.serializedState)
                    : {};
            } catch (e) {
                console.error("Error parsing serializedState:", e);
                throw new Error("Error parsing serializedState:", e);
            }

            // Get the target locale and URLs from the data
            const targetLocale = Object.keys(dataObject.targetLocales)[0];
            const targetVideoUrl =
                dataObject.targetLocales[targetLocale].outputVideoFileUrl;
            const originalVttUrl = dataObject.outputVideoSubtitleWebVttFileUrl;
            const translatedVttUrl =
                dataObject.targetLocales[targetLocale]
                    .outputVideoSubtitleWebVttFileUrl;

            // Update the transcribe state
            const transcribeState = state.transcribe || {};
            const videoInformation = transcribeState.videoInformation || {};

            // Update video languages with new format including label
            const videoLanguages = videoInformation.videoLanguages || [];
            videoLanguages.push({
                code: targetLocale,
                url: targetVideoUrl,
            });

            // Update transcripts
            const transcripts = transcribeState.transcripts || [];

            // Try to add original subtitles if they don't exist
            const autoSubtitlesExist = transcripts.some(
                (transcript) => transcript.name === "Original Subtitles",
            );

            if (!autoSubtitlesExist && originalVttUrl) {
                try {
                    const vttContent =
                        await this.fetchVttContent(originalVttUrl);
                    transcripts.push({
                        url: originalVttUrl,
                        text: vttContent,
                        format: "vtt",
                        name: "Original Subtitles",
                        timestamp: new Date().toISOString(),
                    });
                } catch (error) {
                    console.error(
                        "Failed to fetch original VTT content:",
                        error,
                    );
                    // Continue with translation even if original subtitles fail
                }
            }

            // Try to add translated subtitles
            if (translatedVttUrl) {
                try {
                    const vttContent =
                        await this.fetchVttContent(translatedVttUrl);
                    transcripts.push({
                        url: translatedVttUrl,
                        text: vttContent,
                        format: "vtt",
                        name: `${targetLocaleLabel || targetLocale} Subtitles`,
                        timestamp: new Date().toISOString(),
                    });
                } catch (error) {
                    console.error(
                        "Failed to fetch translated VTT content:",
                        error,
                    );
                }
            }

            // Update the state
            state.transcribe = {
                ...transcribeState,
                videoInformation: {
                    ...videoInformation,
                    videoLanguages,
                },
                transcripts,
            };

            // Save the updated state
            await UserState.findOneAndUpdate(
                { user: userId },
                { serializedState: JSON.stringify(state) },
            );
            console.log(
                "User state updated successfully with new video languages and transcripts",
            );
        } catch (error) {
            console.error("Error updating user state:", error);
            throw error;
        }
    }

    async handleCompletion(taskId, dataObject, metadata, client) {
        const { userId, targetLocaleLabel } = metadata;
        if (userId) {
            await this.handleVideoTranslationCompletion(
                userId,
                dataObject,
                targetLocaleLabel,
            );
        }
        return dataObject;
    }
}

export default new VideoTranslateHandler();
