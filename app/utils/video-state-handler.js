const UserState = require("../api/models/user-state.js").default;

async function fetchVttContent(url) {
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

async function handleVideoTranslationCompletion(
    userId,
    dataObject,
    targetLocaleLabel,
) {
    if (!userId || !dataObject) {
        console.log("Missing required data for video state update");
        return;
    }

    try {
        const userState = await UserState.findOne({ user: userId });
        if (!userState) {
            console.log("User state not found");
            return;
        }

        let state = {};
        try {
            state = userState.serializedState
                ? JSON.parse(userState.serializedState)
                : {};
        } catch (e) {
            console.error("Error parsing serializedState:", e);
            state = {};
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
                const vttContent = await fetchVttContent(originalVttUrl);
                transcripts.push({
                    url: originalVttUrl,
                    text: vttContent,
                    format: "vtt",
                    name: "Original Subtitles",
                    timestamp: new Date().toISOString(),
                });
            } catch (error) {
                console.error("Failed to fetch original VTT content:", error);
                // Continue with translation even if original subtitles fail
            }
        }

        // Try to add translated subtitles
        if (translatedVttUrl) {
            try {
                const vttContent = await fetchVttContent(translatedVttUrl);
                transcripts.push({
                    url: translatedVttUrl,
                    text: vttContent,
                    format: "vtt",
                    name: `${targetLocaleLabel || targetLocale} Subtitles`, // Frontend will handle proper language display
                    timestamp: new Date().toISOString(),
                });
            } catch (error) {
                console.error("Failed to fetch translated VTT content:", error);
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

module.exports = {
    handleVideoTranslationCompletion,
};
