import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import MediaThumbnail from "../MediaThumbnail";

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("lucide-react", () => ({
    AlertCircle: () => <span data-testid="alert-icon" />,
    Loader2: () => <span data-testid="loader-icon" />,
    Music: () => <span data-testid="music-icon" />,
    Play: () => <span data-testid="play-icon" />,
}));

jest.mock("@/src/utils/mediaUtils", () => ({
    __esModule: true,
    getFileIcon: () => () => <span data-testid="file-icon" />,
}));

jest.mock("@/src/components/chat/useFilePreview", () => ({
    __esModule: true,
    useFilePreview: () => ({
        isImage: false,
        isVideo: false,
        isAudio: false,
        isDoc: false,
        isPdf: false,
        isPreviewable: false,
        previewKind: "unsupported",
    }),
    renderFilePreview: () => <span data-testid="rendered-preview" />,
}));

jest.mock("@/src/utils/urlUtils", () => ({
    __esModule: true,
    extractYoutubeVideoId: () => null,
    getYoutubeThumbnailUrl: () => null,
    isYoutubeUrl: () => false,
}));

describe("MediaThumbnail", () => {
    it("renders audio artwork when mediaType is audio even without extension inference", () => {
        render(
            <MediaThumbnail
                src="https://example.com/generated-audio"
                filename="generated-audio"
                mediaType="audio"
            />,
        );

        expect(screen.getByTestId("music-icon")).toBeInTheDocument();
        expect(screen.queryByTestId("file-icon")).not.toBeInTheDocument();
    });

    it("does not show a loading spinner for explicit audio thumbnails", () => {
        render(
            <MediaThumbnail
                src="https://example.com/sunrise-in-arizona.mpeg"
                filename="sunrise-in-arizona.mpeg"
                mediaType="audio"
            />,
        );

        expect(screen.getByTestId("music-icon")).toBeInTheDocument();
        expect(screen.queryByTestId("loader-icon")).not.toBeInTheDocument();
    });

    it("renders a failed status thumbnail without loading a media preview", () => {
        render(
            <MediaThumbnail
                src="https://example.com/broken-video.mp4"
                filename="broken-video.mp4"
                mediaType="video"
                mediaStatus="failed"
                mediaError={{ message: "Provider rejected the request" }}
            />,
        );

        expect(screen.getByTestId("alert-icon")).toBeInTheDocument();
        expect(screen.getByText("Failed")).toBeInTheDocument();
        expect(
            screen.queryByTestId("rendered-preview"),
        ).not.toBeInTheDocument();
        expect(screen.queryByTestId("loader-icon")).not.toBeInTheDocument();
        expect(screen.queryByTestId("play-icon")).not.toBeInTheDocument();
    });

    it("renders a processing status thumbnail without loading a media preview", () => {
        render(
            <MediaThumbnail
                src="https://example.com/processing-video.mp4"
                filename="processing-video.mp4"
                mediaType="video"
                mediaStatus="pending"
            />,
        );

        expect(screen.getByText("Processing")).toBeInTheDocument();
        expect(
            screen.queryByTestId("rendered-preview"),
        ).not.toBeInTheDocument();
        expect(screen.queryByTestId("play-icon")).not.toBeInTheDocument();
    });

    it("renders a static video placeholder instead of loading video thumbnails without a thumbnail image", () => {
        render(
            <MediaThumbnail
                src="https://example.com/generated-video.mp4"
                filename="generated-video.mp4"
                mediaType="video"
            />,
        );

        expect(screen.getByTestId("play-icon")).toBeInTheDocument();
        expect(
            screen.queryByTestId("rendered-preview"),
        ).not.toBeInTheDocument();
        expect(screen.queryByTestId("loader-icon")).not.toBeInTheDocument();
    });

    it("renders a provided thumbnail image for videos", () => {
        render(
            <MediaThumbnail
                src="https://example.com/generated-video.mp4"
                filename="generated-video.mp4"
                mediaType="video"
                thumbnailSrc="https://example.com/generated-video-thumb.jpg"
            />,
        );

        const thumbnail = screen.getByRole("img", {
            name: "generated-video.mp4",
        });
        expect(thumbnail).toHaveAttribute(
            "src",
            "https://example.com/generated-video-thumb.jpg",
        );
        expect(
            screen.queryByTestId("rendered-preview"),
        ).not.toBeInTheDocument();
    });
});
