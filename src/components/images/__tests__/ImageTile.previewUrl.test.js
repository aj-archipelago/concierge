/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import ImageTile from "../ImageTile";
import { getDownloadUrl } from "../../../utils/fileDownloadUtils";

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("../../../utils/fileDownloadUtils", () => ({
    getDownloadUrl: jest.fn((url) => `/api/image-proxy?url=${url}`),
}));

jest.mock("../../chat/MediaCard", () => ({
    ImageWithFallback: ({ src, alt, onError }) => (
        <img src={src} alt={alt} onError={onError} />
    ),
}));

jest.mock("../SyncedAudioControl", () => ({
    __esModule: true,
    default: ({ src, ariaLabel }) => (
        <audio data-testid="synced-audio" src={src} aria-label={ariaLabel} />
    ),
}));

jest.mock("../../editor/ProgressUpdate", () => ({
    __esModule: true,
    default: () => <div data-testid="progress-update" />,
}));

jest.mock("@/components/ui/dialog", () => ({
    Dialog: ({ children }) => <div>{children}</div>,
    DialogContent: ({ children }) => <div>{children}</div>,
    DialogHeader: ({ children }) => <div>{children}</div>,
    DialogTitle: ({ children }) => <div>{children}</div>,
}));

function renderTile(image) {
    return render(
        <ImageTile
            image={{
                cortexRequestId: "request-1",
                taskId: "task-1",
                prompt: "A generated media item",
                status: "completed",
                ...image,
            }}
            onClick={jest.fn()}
            onDelete={jest.fn()}
            onRegenerate={jest.fn()}
            onGenerationComplete={jest.fn()}
            quality="standard"
            selectedImages={new Set()}
            setSelectedImages={jest.fn()}
            selectedImagesObjects={[]}
            setSelectedImagesObjects={jest.fn()}
            lastSelectedImage={null}
            setLastSelectedImage={jest.fn()}
            images={[]}
            setShowDeleteSelectedConfirm={jest.fn()}
            audioPlayback={null}
            onAudioPlaybackChange={jest.fn()}
        />,
    );
}

describe("ImageTile preview URLs", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("uses the managed proxy URL for video previews", () => {
        renderTile({
            type: "video",
            azureUrl: "https://storage.example/video.mp4?stale=sas",
        });

        expect(screen.getByTestId("image-tile-video-preview")).toHaveAttribute(
            "src",
            "/api/image-proxy?url=https://storage.example/video.mp4?stale=sas",
        );
        expect(getDownloadUrl).toHaveBeenCalledWith(
            "https://storage.example/video.mp4?stale=sas",
        );
    });

    it("uses the managed proxy URL for audio previews", () => {
        renderTile({
            type: "audio",
            azureUrl: "https://storage.example/audio.mp3?stale=sas",
        });

        expect(screen.getByTestId("synced-audio")).toHaveAttribute(
            "src",
            "/api/image-proxy?url=https://storage.example/audio.mp3?stale=sas",
        );
        expect(getDownloadUrl).toHaveBeenCalledWith(
            "https://storage.example/audio.mp3?stale=sas",
        );
    });
});
