import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import FileGridView from "../FileGridView";

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock(
    "@/src/components/common/MediaThumbnail",
    () => ({
        __esModule: true,
        default: (props) => (
            <div
                data-testid="media-thumbnail"
                data-media-type={props.mediaType || ""}
                data-mime-type={props.mimeType || ""}
                data-media-status={props.mediaStatus || ""}
                data-thumbnail-src={props.thumbnailSrc || ""}
                title={props.mediaError?.message || ""}
            />
        ),
    }),
    { virtual: true },
);

jest.mock(
    "@/src/components/common/FileManager",
    () => ({
        __esModule: true,
        getFilePreviewUrl: (file) => file.url,
        getFileThumbnailUrl: (file) => file._mediaItem?.thumbnailUrl || null,
        getFilename: (file) => file.filename,
        formatFileSize: () => "",
    }),
    { virtual: true },
);

jest.mock(
    "@/components/ui/dropdown-menu",
    () => ({
        DropdownMenu: ({ children }) => <div>{children}</div>,
        DropdownMenuTrigger: ({ children }) => children,
        DropdownMenuContent: ({
            children,
            align: _align,
            sideOffset: _sideOffset,
            ...props
        }) => <div {...props}>{children}</div>,
        DropdownMenuItem: ({ children, onSelect, ...props }) => (
            <button type="button" onClick={onSelect} {...props}>
                {children}
            </button>
        ),
    }),
    { virtual: true },
);

describe("FileGridView", () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it("does not select a grid item when preview is clicked from the context menu", () => {
        const file = {
            _id: "file-1",
            filename: "clip.mp4",
            url: "https://example.com/clip.mp4",
        };
        const onSelectFile = jest.fn();
        const onPreview = jest.fn();

        render(
            <FileGridView
                files={[file]}
                selectedIds={new Set()}
                getFileId={(entry) => entry._id}
                onSelectFile={onSelectFile}
                onPreview={onPreview}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Preview" }));

        expect(onPreview).toHaveBeenCalledWith(file);
        expect(onSelectFile).not.toHaveBeenCalled();
    });

    it("does not select a grid item before opening preview on double click", () => {
        jest.useFakeTimers();

        const file = {
            _id: "file-1",
            filename: "clip.mp4",
            url: "https://example.com/clip.mp4",
        };
        const onSelectFile = jest.fn();
        const onPreview = jest.fn();

        render(
            <FileGridView
                files={[file]}
                selectedIds={new Set()}
                getFileId={(entry) => entry._id}
                onSelectFile={onSelectFile}
                onPreview={onPreview}
            />,
        );

        const card = screen.getByTestId("file-grid-card-0");
        fireEvent.click(card);
        fireEvent.doubleClick(card);

        act(() => {
            jest.advanceTimersByTime(250);
        });

        expect(onPreview).toHaveBeenCalledWith(file);
        expect(onSelectFile).not.toHaveBeenCalled();
    });

    it("suppresses browser text selection inside grid tiles", () => {
        render(
            <FileGridView
                files={[
                    {
                        _id: "file-1",
                        filename: "clip.mp4",
                        url: "https://example.com/clip.mp4",
                    },
                ]}
                selectedIds={new Set()}
                getFileId={(entry) => entry._id}
                onSelectFile={jest.fn()}
            />,
        );

        expect(screen.getByTestId("file-grid-card-0")).toHaveClass(
            "select-none",
        );
    });

    it("passes the explicit media type to grid thumbnails", () => {
        render(
            <FileGridView
                files={[
                    {
                        _id: "audio",
                        filename: "soundtrack",
                        url: "https://example.com/audio",
                        type: "audio",
                    },
                ]}
                selectedIds={new Set()}
                getFileId={(entry) => entry._id}
                onSelectFile={jest.fn()}
            />,
        );

        expect(screen.getByTestId("media-thumbnail")).toHaveAttribute(
            "data-media-type",
            "audio",
        );
    });

    it("passes contentType to grid thumbnails when mimeType is missing", () => {
        render(
            <FileGridView
                files={[
                    {
                        _id: "audio",
                        filename: "soundtrack",
                        url: "https://example.com/audio",
                        type: "file",
                        contentType: "audio/mpeg",
                    },
                ]}
                selectedIds={new Set()}
                getFileId={(entry) => entry._id}
                onSelectFile={jest.fn()}
            />,
        );

        expect(screen.getByTestId("media-thumbnail")).toHaveAttribute(
            "data-mime-type",
            "audio/mpeg",
        );
    });

    it("passes media status and error details to grid thumbnails", () => {
        render(
            <FileGridView
                files={[
                    {
                        _id: "failed",
                        filename: "Failed.mp4",
                        url: "https://example.com/failed.mp4",
                        _mediaItem: {
                            type: "video",
                            status: "failed",
                            error: { message: "Provider error" },
                        },
                    },
                ]}
                selectedIds={new Set()}
                getFileId={(entry) => entry._id}
                onSelectFile={jest.fn()}
            />,
        );

        const thumbnail = screen.getByTestId("media-thumbnail");
        expect(thumbnail).toHaveAttribute("data-media-status", "failed");
        expect(thumbnail).toHaveAttribute("title", "Provider error");
    });

    it("passes media thumbnail URLs to grid thumbnails", () => {
        render(
            <FileGridView
                files={[
                    {
                        _id: "video",
                        filename: "Video.mp4",
                        url: "https://example.com/video.mp4",
                        _mediaItem: {
                            type: "video",
                            thumbnailUrl: "https://example.com/thumb.jpg",
                        },
                    },
                ]}
                selectedIds={new Set()}
                getFileId={(entry) => entry._id}
                onSelectFile={jest.fn()}
            />,
        );

        expect(screen.getByTestId("media-thumbnail")).toHaveAttribute(
            "data-thumbnail-src",
            "https://example.com/thumb.jpg",
        );
    });

    it("plays video inline when the play cue is clicked", () => {
        const file = {
            _id: "video",
            filename: "Video.mp4",
            url: "https://example.com/video.mp4",
            _mediaItem: {
                type: "video",
                thumbnailUrl: "https://example.com/thumb.jpg",
            },
        };
        const onSelectFile = jest.fn();
        const onPreview = jest.fn();

        render(
            <FileGridView
                files={[file]}
                selectedIds={new Set()}
                getFileId={(entry) => entry._id}
                onSelectFile={onSelectFile}
                onPreview={onPreview}
            />,
        );

        fireEvent.click(screen.getByTestId("media-play-cue"));

        expect(screen.getByTestId("media-inline-video-player")).toHaveAttribute(
            "src",
            "https://example.com/video.mp4",
        );
        expect(onPreview).not.toHaveBeenCalled();
        expect(onSelectFile).not.toHaveBeenCalled();
    });

    it("dismisses the inline player when clicking outside it", () => {
        const file = {
            _id: "video",
            filename: "Video.mp4",
            url: "https://example.com/video.mp4",
            _mediaItem: {
                type: "video",
            },
        };

        render(
            <FileGridView
                files={[file]}
                selectedIds={new Set()}
                getFileId={(entry) => entry._id}
                onSelectFile={jest.fn()}
                onPreview={jest.fn()}
            />,
        );

        fireEvent.click(screen.getByTestId("media-play-cue"));
        expect(
            screen.getByTestId("media-inline-video-player"),
        ).toBeInTheDocument();

        fireEvent.pointerDown(document.body);

        expect(
            screen.queryByTestId("media-inline-video-player"),
        ).not.toBeInTheDocument();
    });

    it("keeps the inline player open when clicking inside it", () => {
        const file = {
            _id: "video",
            filename: "Video.mp4",
            url: "https://example.com/video.mp4",
            _mediaItem: {
                type: "video",
            },
        };

        render(
            <FileGridView
                files={[file]}
                selectedIds={new Set()}
                getFileId={(entry) => entry._id}
                onSelectFile={jest.fn()}
                onPreview={jest.fn()}
            />,
        );

        fireEvent.click(screen.getByTestId("media-play-cue"));
        const player = screen.getByTestId("media-inline-video-player");

        fireEvent.pointerDown(player);

        expect(
            screen.getByTestId("media-inline-video-player"),
        ).toBeInTheDocument();
    });

    it("plays audio inline when the play cue is clicked", () => {
        const file = {
            _id: "audio",
            filename: "Audio.mp3",
            url: "https://example.com/audio.mp3",
            _mediaItem: {
                type: "audio",
            },
        };
        const onSelectFile = jest.fn();
        const onPreview = jest.fn();

        render(
            <FileGridView
                files={[file]}
                selectedIds={new Set()}
                getFileId={(entry) => entry._id}
                onSelectFile={onSelectFile}
                onPreview={onPreview}
            />,
        );

        fireEvent.click(screen.getByTestId("media-play-cue"));

        expect(screen.getByTestId("media-inline-audio-player")).toHaveAttribute(
            "src",
            "https://example.com/audio.mp3",
        );
        expect(onPreview).not.toHaveBeenCalled();
        expect(onSelectFile).not.toHaveBeenCalled();
    });

    it("does not show the play cue for image grid items", () => {
        render(
            <FileGridView
                files={[
                    {
                        _id: "image",
                        filename: "Image.png",
                        url: "https://example.com/image.png",
                        mimeType: "image/png",
                    },
                ]}
                selectedIds={new Set()}
                getFileId={(entry) => entry._id}
                onSelectFile={jest.fn()}
            />,
        );

        expect(screen.queryByTestId("media-play-cue")).not.toBeInTheDocument();
    });

    it("does not show the play cue for processing media grid items", () => {
        render(
            <FileGridView
                files={[
                    {
                        _id: "video",
                        filename: "Video.mp4",
                        url: "https://example.com/video.mp4",
                        _mediaItem: {
                            type: "video",
                            status: "processing",
                        },
                    },
                ]}
                selectedIds={new Set()}
                getFileId={(entry) => entry._id}
                onSelectFile={jest.fn()}
                onPreview={jest.fn()}
            />,
        );

        expect(screen.queryByTestId("media-play-cue")).not.toBeInTheDocument();
    });

    it("does not show the play cue for failed media grid items", () => {
        render(
            <FileGridView
                files={[
                    {
                        _id: "video",
                        filename: "Video.mp4",
                        url: "https://example.com/video.mp4",
                        _mediaItem: {
                            type: "video",
                            status: "failed",
                        },
                    },
                ]}
                selectedIds={new Set()}
                getFileId={(entry) => entry._id}
                onSelectFile={jest.fn()}
                onPreview={jest.fn()}
            />,
        );

        expect(screen.queryByTestId("media-play-cue")).not.toBeInTheDocument();
    });
});
