describe("transcribe completion state", () => {
    test("stores alternative tracks and selects the new transcript", async () => {
        const { applyTranscriptionCompletionToState } = await import(
            "../tasks/transcribe-state.mjs"
        );

        const state = {
            transcribe: {
                videoInformation: {
                    videoUrl: "https://example.com/video.mp4",
                    transcriptionUrl: "https://cdn.example.com/audio.mp3",
                },
                transcripts: [
                    {
                        text: "old",
                        format: "vtt",
                        name: "Subtitles",
                    },
                ],
                activeTranscript: 0,
            },
        };

        const result = applyTranscriptionCompletionToState({
            state,
            transcriptionData: "new",
            storedFormat: "vtt",
            metadata: {
                url: "https://cdn.example.com/audio.mp3",
                trackName: "Subtitles (alternative)",
                isAlternative: true,
            },
        });

        expect(result.applied).toBe(true);
        expect(result.state.transcribe.activeTranscript).toBe(1);
        expect(result.state.transcribe.transcripts).toHaveLength(2);
        expect(result.state.transcribe.transcripts[1]).toMatchObject({
            text: "new",
            format: "vtt",
            name: "Subtitles (alternative)",
            isAlternative: true,
        });
    });

    test("does not write stale completions into a changed video", async () => {
        const { applyTranscriptionCompletionToState } = await import(
            "../tasks/transcribe-state.mjs"
        );

        const state = {
            transcribe: {
                videoInformation: {
                    videoUrl: "https://example.com/current.mp4",
                    transcriptionUrl: null,
                },
                transcripts: [],
            },
        };

        const result = applyTranscriptionCompletionToState({
            state,
            transcriptionData: "stale",
            storedFormat: "vtt",
            metadata: {
                url: "https://example.com/previous.mp4",
            },
        });

        expect(result.applied).toBe(false);
        expect(result.state).toBe(state);
        expect(result.state.transcribe.transcripts).toEqual([]);
    });

    test("does not write completions after video state was cleared", async () => {
        const { applyTranscriptionCompletionToState } = await import(
            "../tasks/transcribe-state.mjs"
        );

        const state = {
            transcribe: {
                url: "https://example.com/previous.mp4",
                videoInformation: null,
                transcripts: [],
            },
        };

        const result = applyTranscriptionCompletionToState({
            state,
            transcriptionData: "stale",
            storedFormat: "vtt",
            metadata: {
                url: "https://example.com/previous.mp4",
            },
        });

        expect(result.applied).toBe(false);
        expect(result.state).toBe(state);
        expect(result.state.transcribe.transcripts).toEqual([]);
    });

    test("escapes track names when suffixing duplicates", async () => {
        const { applyTranscriptionCompletionToState } = await import(
            "../tasks/transcribe-state.mjs"
        );

        const state = {
            transcribe: {
                videoInformation: {
                    videoUrl: "https://example.com/video.mp4",
                },
                transcripts: [
                    { text: "first", format: "vtt", name: "A+B (alternative)" },
                    {
                        text: "second",
                        format: "vtt",
                        name: "A+B (alternative) (1)",
                    },
                ],
            },
        };

        const result = applyTranscriptionCompletionToState({
            state,
            transcriptionData: "third",
            storedFormat: "vtt",
            metadata: {
                url: "https://example.com/video.mp4",
                trackName: "A+B (alternative)",
            },
        });

        expect(result.applied).toBe(true);
        expect(result.transcript.name).toBe("A+B (alternative) (2)");
    });
});
