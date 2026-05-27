import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import FileContentArea from "../FileContentArea";

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("react-toastify", () => ({
    toast: {
        error: jest.fn(),
    },
}));

jest.mock("i18next", () => ({
    language: "en",
}));

jest.mock("lucide-react", () => {
    const Icon = () => <span />;
    return {
        ArrowUpDown: Icon,
        ChevronUp: Icon,
        ChevronDown: Icon,
        Check: Icon,
        Eye: Icon,
        Loader2: Icon,
        Trash2: Icon,
    };
});

jest.mock(
    "@/src/components/common/MediaThumbnail",
    () => ({
        __esModule: true,
        default: (props) => (
            <span
                data-testid="media-thumbnail"
                data-media-type={props.mediaType || ""}
                data-mime-type={props.mimeType || ""}
                data-media-status={props.mediaStatus || ""}
                data-thumbnail-src={props.thumbnailSrc || ""}
                title={props.mediaError?.message || ""}
                data-show-play-overlay={String(props.showPlayOverlay)}
                data-show-video-controls={String(props.showVideoControls)}
            />
        ),
    }),
    { virtual: true },
);

jest.mock(
    "@/components/ui/table",
    () => ({
        Table: ({ children }) => <table>{children}</table>,
        TableBody: ({ children }) => <tbody>{children}</tbody>,
        TableCell: ({ children, ...props }) => <td {...props}>{children}</td>,
        TableHead: ({ children, ...props }) => <th {...props}>{children}</th>,
        TableHeader: ({ children }) => <thead>{children}</thead>,
        TableRow: ({ children, ...props }) => <tr {...props}>{children}</tr>,
    }),
    { virtual: true },
);

jest.mock(
    "@/src/components/common/FileManager",
    () => ({
        __esModule: true,
        getFilename: (file) => file.displayFilename || file.filename || "",
        getFileDate: (file) => new Date(file.modifiedDate),
        getFilePreviewUrl: (file) => file.url || null,
        getFileThumbnailUrl: (file) => file._mediaItem?.thumbnailUrl || null,
        formatFileSize: () => "1 KB",
        formatFileListDate: (d) => (d ? d.toLocaleDateString("en") : "—"),
    }),
    { virtual: true },
);

jest.mock(
    "@/src/utils/fileDownloadUtils",
    () => ({
        __esModule: true,
        INVALID_FILENAME_CHARS: /[\\/:*?"<>|]/,
    }),
    { virtual: true },
);

describe("FileContentArea selection callbacks", () => {
    it("passes the sorted visible file order back to the selection handler", () => {
        const files = [
            {
                _id: "older",
                displayFilename: "Older.txt",
                modifiedDate: "2026-01-01T00:00:00.000Z",
            },
            {
                _id: "newer",
                displayFilename: "Newer.txt",
                modifiedDate: "2026-03-01T00:00:00.000Z",
            },
        ];
        const onSelectFile = jest.fn();

        render(
            <FileContentArea
                files={files}
                selectedIds={new Set()}
                getFileId={(file) => file._id}
                onSelectFile={onSelectFile}
                onSelectAll={jest.fn()}
            />,
        );

        const rows = screen.getAllByRole("row");
        const newerRow = rows.find((row) =>
            row.textContent.includes("Newer.txt"),
        );
        fireEvent.click(newerRow);

        expect(onSelectFile).toHaveBeenCalledTimes(1);
        expect(onSelectFile.mock.calls[0][0]).toBe(files[1]);
        expect(onSelectFile.mock.calls[0][1].map((file) => file._id)).toEqual([
            "newer",
            "older",
        ]);
        expect(onSelectFile.mock.calls[0][2]).toBe(0);
    });

    it("suppresses video controls and play overlay in compact list thumbnails", () => {
        render(
            <FileContentArea
                files={[
                    {
                        _id: "video",
                        displayFilename: "Video.mp4",
                        filename: "Video.mp4",
                        mimeType: "video/mp4",
                        url: "https://example.com/video.mp4",
                        modifiedDate: "2026-03-01T00:00:00.000Z",
                    },
                ]}
                selectedIds={new Set()}
                getFileId={(file) => file._id}
                onSelectFile={jest.fn()}
                onSelectAll={jest.fn()}
            />,
        );

        const thumbnail = screen.getByTestId("media-thumbnail");
        expect(thumbnail).toHaveAttribute("data-show-play-overlay", "false");
        expect(thumbnail).toHaveAttribute("data-show-video-controls", "false");
    });

    it("opens the full preview when a compact list thumbnail is clicked", () => {
        const file = {
            _id: "image",
            displayFilename: "Image.png",
            filename: "Image.png",
            mimeType: "image/png",
            url: "https://example.com/image.png",
            modifiedDate: "2026-03-01T00:00:00.000Z",
        };
        const onPreview = jest.fn();
        const onSelectFile = jest.fn();

        render(
            <FileContentArea
                files={[file]}
                selectedIds={new Set()}
                getFileId={(item) => item._id}
                onSelectFile={onSelectFile}
                onSelectAll={jest.fn()}
                onPreview={onPreview}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Preview" }));

        expect(onPreview).toHaveBeenCalledWith(file);
        expect(onSelectFile).not.toHaveBeenCalled();
    });

    it("uses the mobile actions space for the date instead of delete controls", () => {
        const file = {
            _id: "image",
            displayFilename: "Image.png",
            filename: "Image.png",
            mimeType: "image/png",
            url: "https://example.com/image.png",
            modifiedDate: "2026-03-01T00:00:00.000Z",
        };

        render(
            <FileContentArea
                files={[file]}
                selectedIds={new Set()}
                getFileId={(item) => item._id}
                onSelectFile={jest.fn()}
                onSelectAll={jest.fn()}
                onPreview={jest.fn()}
                onDelete={jest.fn()}
                isMobile
            />,
        );

        expect(
            screen.getByText(
                new Date(file.modifiedDate).toLocaleDateString("en"),
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Delete file" }),
        ).not.toBeInTheDocument();
    });

    it("passes the explicit media type to compact list thumbnails", () => {
        render(
            <FileContentArea
                files={[
                    {
                        _id: "audio",
                        displayFilename: "Soundtrack",
                        filename: "Soundtrack",
                        type: "audio",
                        url: "https://example.com/audio",
                        modifiedDate: "2026-03-01T00:00:00.000Z",
                    },
                ]}
                selectedIds={new Set()}
                getFileId={(file) => file._id}
                onSelectFile={jest.fn()}
                onSelectAll={jest.fn()}
            />,
        );

        expect(screen.getByTestId("media-thumbnail")).toHaveAttribute(
            "data-media-type",
            "audio",
        );
    });

    it("passes contentType to compact list thumbnails when mimeType is missing", () => {
        render(
            <FileContentArea
                files={[
                    {
                        _id: "audio",
                        displayFilename: "Soundtrack",
                        filename: "Soundtrack",
                        type: "file",
                        contentType: "audio/mpeg",
                        url: "https://example.com/audio",
                        modifiedDate: "2026-03-01T00:00:00.000Z",
                    },
                ]}
                selectedIds={new Set()}
                getFileId={(file) => file._id}
                onSelectFile={jest.fn()}
                onSelectAll={jest.fn()}
            />,
        );

        expect(screen.getByTestId("media-thumbnail")).toHaveAttribute(
            "data-mime-type",
            "audio/mpeg",
        );
    });

    it("passes media status and error details to compact list thumbnails", () => {
        render(
            <FileContentArea
                files={[
                    {
                        _id: "failed",
                        displayFilename: "Failed.mp4",
                        filename: "Failed.mp4",
                        url: "https://example.com/failed.mp4",
                        modifiedDate: "2026-03-01T00:00:00.000Z",
                        _mediaItem: {
                            type: "video",
                            status: "failed",
                            error: { message: "Provider error" },
                        },
                    },
                ]}
                selectedIds={new Set()}
                getFileId={(file) => file._id}
                onSelectFile={jest.fn()}
                onSelectAll={jest.fn()}
            />,
        );

        const thumbnail = screen.getByTestId("media-thumbnail");
        expect(thumbnail).toHaveAttribute("data-media-status", "failed");
        expect(thumbnail).toHaveAttribute("title", "Provider error");
    });

    it("passes media thumbnail URLs to compact list thumbnails", () => {
        render(
            <FileContentArea
                files={[
                    {
                        _id: "video",
                        displayFilename: "Video.mp4",
                        filename: "Video.mp4",
                        url: "https://example.com/video.mp4",
                        modifiedDate: "2026-03-01T00:00:00.000Z",
                        _mediaItem: {
                            type: "video",
                            thumbnailUrl: "https://example.com/thumb.jpg",
                        },
                    },
                ]}
                selectedIds={new Set()}
                getFileId={(file) => file._id}
                onSelectFile={jest.fn()}
                onSelectAll={jest.fn()}
            />,
        );

        expect(screen.getByTestId("media-thumbnail")).toHaveAttribute(
            "data-thumbnail-src",
            "https://example.com/thumb.jpg",
        );
    });

    it("sorts files by type from the Type column", () => {
        const files = [
            {
                _id: "video",
                displayFilename: "Video.mp4",
                filename: "Video.mp4",
                mimeType: "video/mp4",
                modifiedDate: "2026-03-01T00:00:00.000Z",
            },
            {
                _id: "audio",
                displayFilename: "Audio.mp3",
                filename: "Audio.mp3",
                mimeType: "audio/mpeg",
                modifiedDate: "2026-01-01T00:00:00.000Z",
            },
        ];

        render(
            <FileContentArea
                files={files}
                selectedIds={new Set()}
                getFileId={(file) => file._id}
                onSelectFile={jest.fn()}
                onSelectAll={jest.fn()}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Type" }));

        const rows = screen.getAllByRole("row").slice(1);
        expect(rows[0]).toHaveTextContent("Audio.mp3");
        expect(rows[0]).toHaveTextContent("Audio");
        expect(rows[1]).toHaveTextContent("Video.mp4");
        expect(rows[1]).toHaveTextContent("Video");
    });
});
