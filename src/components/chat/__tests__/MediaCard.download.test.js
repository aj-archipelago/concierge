/**
 * @jest-environment jsdom
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import MediaCard from "../MediaCard";

let mockPreviewable = false;

jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

jest.mock("../../../contexts/LanguageProvider", () => {
    const React = require("react");
    return {
        __esModule: true,
        LanguageContext: React.createContext({ direction: "ltr" }),
    };
});

jest.mock("../../common/FileManager", () => ({
    FilePreviewDialog: () => <div data-testid="file-preview-dialog" />,
}));

jest.mock("../useFilePreview", () => ({
    useFilePreview: () => ({
        isPreviewable: mockPreviewable,
        isPdf: mockPreviewable,
        isDoc: true,
        isImage: false,
        isVideo: false,
    }),
    renderFilePreview: () =>
        mockPreviewable ? <div data-testid="file-preview-thumbnail" /> : null,
}));

jest.mock("../../../utils/fileDownloadUtils", () => ({
    getDownloadUrl: jest.fn(
        (url) => `/api/download?url=${encodeURIComponent(url)}`,
    ),
    getFilename: jest.fn(
        (file) => file?.displayFilename || file?.filename || "",
    ),
}));

describe("MediaCard downloads", () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalFetch = global.fetch;
    const originalCreateElement = document.createElement.bind(document);

    beforeEach(() => {
        mockPreviewable = false;
        URL.createObjectURL = jest.fn(() => "blob:download");
        URL.revokeObjectURL = jest.fn();
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                blob: () => Promise.resolve(new Blob(["file"])),
            }),
        );
    });

    afterEach(() => {
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
        global.fetch = originalFetch;
        document.createElement = originalCreateElement;
        jest.restoreAllMocks();
    });

    it("shows a download action for non-preview files and downloads them", async () => {
        const anchorClick = jest.fn();
        jest.spyOn(document, "createElement").mockImplementation((tagName) => {
            const element = originalCreateElement(tagName);
            if (tagName === "a") {
                element.click = anchorClick;
            }
            return element;
        });

        render(
            <MediaCard
                type="file"
                src="https://example.com/deck.pptx"
                filename="deck.pptx"
            />,
        );

        const downloadButton = screen.getByLabelText("Download");
        expect(downloadButton).toBeInTheDocument();

        fireEvent.click(downloadButton);

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/download?url=https%3A%2F%2Fexample.com%2Fdeck.pptx",
            );
        });
        expect(anchorClick).toHaveBeenCalled();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:download");
    });

    it("keeps the download action working for previewable file cards", async () => {
        mockPreviewable = true;
        const anchorClick = jest.fn();
        jest.spyOn(document, "createElement").mockImplementation((tagName) => {
            const element = originalCreateElement(tagName);
            if (tagName === "a") {
                element.click = anchorClick;
            }
            return element;
        });

        render(
            <MediaCard
                type="file"
                src="https://example.com/guide.pdf"
                filename="guide.pdf"
            />,
        );

        expect(
            screen.getByTestId("file-preview-thumbnail"),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText("Download"));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/download?url=https%3A%2F%2Fexample.com%2Fguide.pdf",
            );
        });
        expect(anchorClick).toHaveBeenCalled();

        fireEvent.click(screen.getByTestId("file-preview-thumbnail"));
        expect(screen.getByTestId("file-preview-dialog")).toBeInTheDocument();
    });

    it("shows the same download action on image cards", async () => {
        const anchorClick = jest.fn();
        jest.spyOn(document, "createElement").mockImplementation((tagName) => {
            const element = originalCreateElement(tagName);
            if (tagName === "a") {
                element.click = anchorClick;
            }
            return element;
        });

        render(
            <MediaCard
                type="image"
                src="https://example.com/diagram.png"
                filename="diagram.png"
            />,
        );

        fireEvent.click(screen.getByLabelText("Download"));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/download?url=https%3A%2F%2Fexample.com%2Fdiagram.png",
            );
        });
        expect(anchorClick).toHaveBeenCalled();

        fireEvent.click(screen.getByAltText("diagram.png"));
        expect(screen.getByTestId("file-preview-dialog")).toBeInTheDocument();
    });

    it("uses the managed proxy URL for video previews", () => {
        render(
            <MediaCard
                type="video"
                src="https://example.com/clip.mp4?stale=sas"
                filename="clip.mp4"
            />,
        );

        expect(screen.getByTestId("media-card-video-preview")).toHaveAttribute(
            "src",
            "/api/download?url=https%3A%2F%2Fexample.com%2Fclip.mp4%3Fstale%3Dsas",
        );
    });

    it("does not show a download action on youtube cards", () => {
        render(
            <MediaCard
                type="youtube"
                src="https://www.youtube.com/watch?v=abc123"
                filename="youtube-video"
                youtubeEmbedUrl="https://www.youtube.com/embed/abc123"
            />,
        );

        expect(screen.queryByLabelText("Download")).not.toBeInTheDocument();
    });
});
