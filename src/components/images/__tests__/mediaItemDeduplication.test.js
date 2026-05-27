import {
    dedupeMediaItemsForDisplay,
    isLikelyRawStorageFileForProcessingMedia,
} from "../mediaItemDeduplication";

describe("dedupeMediaItemsForDisplay", () => {
    it("suppresses transient storage-sync completions with the pending generation filename mask", () => {
        const pending = {
            _id: "pending-row",
            taskId: "task-abcdef123456",
            cortexRequestId: "task-abcdef123456",
            type: "video",
            model: "veo-3",
            status: "pending",
            outputFolder: "media/projects",
            prompt: "City skyline at sunset",
            created: 100,
        };
        const storageSyncCompletion = {
            _id: "storage-row",
            taskId: "storage-sync-1",
            cortexRequestId: "storage-sync-1",
            type: "video",
            model: "storage-sync",
            status: "completed",
            blobPath:
                "contexts/user/media/projects/city-skyline-at-sunset-abcdef123456.mp4",
            created: 125,
        };

        expect(
            dedupeMediaItemsForDisplay([storageSyncCompletion, pending]),
        ).toEqual([pending]);
    });

    it("coalesces storage-sync and generated rows for the same completed media", () => {
        const storageSyncCompletion = {
            _id: "storage-row",
            taskId: "storage-sync-1",
            cortexRequestId: "storage-sync-1",
            type: "video",
            model: "storage-sync",
            status: "completed",
            hash: "abc123",
            created: 125,
        };
        const generatedCompletion = {
            _id: "generated-row",
            taskId: "task-1",
            cortexRequestId: "task-1",
            type: "video",
            model: "veo-3",
            status: "completed",
            hash: "abc123",
            created: 100,
            completed: 130,
        };

        expect(
            dedupeMediaItemsForDisplay([
                storageSyncCompletion,
                generatedCompletion,
            ]),
        ).toEqual([generatedCompletion]);
    });

    it("identifies raw storage files by expected generated filename mask before the extension is known", () => {
        const processing = {
            _id: "pending-row",
            taskId: "task-abcdef123456",
            cortexRequestId: "task-abcdef123456",
            type: "video",
            model: "veo-3",
            status: "processing",
            outputFolder: "media/projects",
            prompt: "City skyline at sunset",
            created: 100,
        };
        const rawStorageFile = {
            filename: "city-skyline-at-sunset-abcdef123456.mp4",
            blobPath:
                "contexts/user/media/projects/city-skyline-at-sunset-abcdef123456.mp4",
            contentType: "video/mp4",
            lastModified: new Date(125000).toISOString(),
        };

        expect(
            isLikelyRawStorageFileForProcessingMedia(rawStorageFile, [
                processing,
            ]),
        ).toBe(true);
    });

    it("does not suppress a same-type storage file in the same folder with a different generated filename mask", () => {
        const processing = {
            taskId: "task-abcdef123456",
            cortexRequestId: "task-abcdef123456",
            type: "video",
            model: "veo-3",
            status: "processing",
            outputFolder: "media/projects",
            prompt: "City skyline at sunset",
            created: 100,
        };
        const unrelatedStorageFile = {
            filename: "provider-output-name.mp4",
            blobPath: "contexts/user/media/projects/provider-output-name.mp4",
            contentType: "video/mp4",
            lastModified: new Date(125000).toISOString(),
        };

        expect(
            isLikelyRawStorageFileForProcessingMedia(unrelatedStorageFile, [
                processing,
            ]),
        ).toBe(false);
    });

    it("does not identify already augmented media items as raw storage duplicates", () => {
        const processing = {
            taskId: "task-abcdef123456",
            type: "audio",
            model: "qwen3-tts",
            status: "pending",
            prompt: "Say hello",
            created: 100,
        };
        const augmentedFile = {
            _mediaItem: {
                type: "audio",
                status: "completed",
            },
            filename: "voice.wav",
            blobPath: "media/voice.wav",
            contentType: "audio/wav",
            lastModified: new Date(125000).toISOString(),
        };

        expect(
            isLikelyRawStorageFileForProcessingMedia(augmentedFile, [
                processing,
            ]),
        ).toBe(false);
    });

    it("suppresses promptless image-to-audio uploads using the stored display prompt", () => {
        const processing = {
            taskId: "6924c752e354c24a5d1da2c4",
            cortexRequestId: "6924c752e354c24a5d1da2c4",
            type: "audio",
            model: "google-lyria-3-music",
            status: "pending",
            outputFolder: "media/music",
            prompt: "Image-only music generation",
            created: 100,
        };
        const rawStorageFile = {
            filename: "image-only-music-generation-c24a5d1da2c4.wav",
            blobPath:
                "contexts/user/media/music/image-only-music-generation-c24a5d1da2c4.wav",
            contentType: "audio/wav",
            lastModified: new Date(125000).toISOString(),
        };

        expect(
            isLikelyRawStorageFileForProcessingMedia(rawStorageFile, [
                processing,
            ]),
        ).toBe(true);
    });
});
