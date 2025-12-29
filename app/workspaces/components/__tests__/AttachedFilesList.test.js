/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import AttachedFilesList from "../AttachedFilesList";

// Mock the translation hook
jest.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

// Mock getFileIcon
jest.mock("../../../../src/utils/mediaUtils", () => ({
    getFileIcon: jest.fn(() => {
        // Return a mock icon component
        return () => <span data-testid="file-icon">📄</span>;
    }),
}));

describe("AttachedFilesList", () => {
    const mockOnRemove = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return null when files array is empty", () => {
        render(<AttachedFilesList files={[]} onRemove={mockOnRemove} />);
        expect(screen.queryByText(/file/i)).not.toBeInTheDocument();
    });

    it("should render files with displayFilename", () => {
        const files = [
            {
                hash: "hash1",
                _id: "file1",
                displayFilename: "test-document.pdf",
            },
            {
                hash: "hash2",
                _id: "file2",
                displayFilename: "image.jpg",
            },
        ];

        render(<AttachedFilesList files={files} onRemove={mockOnRemove} />);

        expect(screen.getByText("test-document.pdf")).toBeInTheDocument();
        expect(screen.getByText("image.jpg")).toBeInTheDocument();
    });

    it("should fallback to originalName when displayFilename is missing", () => {
        const files = [
            {
                hash: "hash1",
                _id: "file1",
                originalName: "original-name.pdf",
            },
        ];

        render(<AttachedFilesList files={files} onRemove={mockOnRemove} />);

        expect(screen.getByText("original-name.pdf")).toBeInTheDocument();
    });

    it("should fallback to filename when displayFilename and originalName are missing", () => {
        const files = [
            {
                hash: "hash1",
                _id: "file1",
                filename: "fallback-name.pdf",
            },
        ];

        render(<AttachedFilesList files={files} onRemove={mockOnRemove} />);

        expect(screen.getByText("fallback-name.pdf")).toBeInTheDocument();
    });

    it("should call onRemove with correct index when remove button is clicked", () => {
        const files = [
            {
                hash: "hash1",
                _id: "file1",
                displayFilename: "file1.pdf",
            },
            {
                hash: "hash2",
                _id: "file2",
                displayFilename: "file2.jpg",
            },
            {
                hash: "hash3",
                _id: "file3",
                displayFilename: "file3.png",
            },
        ];

        render(<AttachedFilesList files={files} onRemove={mockOnRemove} />);

        // Get all remove buttons (X icons)
        const removeButtons = screen.getAllByTitle("Remove file");

        // Click the second file's remove button
        fireEvent.click(removeButtons[1]);

        expect(mockOnRemove).toHaveBeenCalledTimes(1);
        expect(mockOnRemove).toHaveBeenCalledWith(1);
    });

    it("should disable remove buttons when disabled prop is true", () => {
        const files = [
            {
                hash: "hash1",
                _id: "file1",
                displayFilename: "file1.pdf",
            },
        ];

        render(
            <AttachedFilesList
                files={files}
                onRemove={mockOnRemove}
                disabled={true}
            />,
        );

        const removeButton = screen.getByTitle("Remove file");
        expect(removeButton).toBeDisabled();
    });

    it("should not disable remove buttons when disabled prop is false", () => {
        const files = [
            {
                hash: "hash1",
                _id: "file1",
                displayFilename: "file1.pdf",
            },
        ];

        render(
            <AttachedFilesList
                files={files}
                onRemove={mockOnRemove}
                disabled={false}
            />,
        );

        const removeButton = screen.getByTitle("Remove file");
        expect(removeButton).not.toBeDisabled();
    });

    it("should use hash as key when available", () => {
        const files = [
            {
                hash: "hash1",
                displayFilename: "file1.pdf",
            },
        ];

        render(<AttachedFilesList files={files} onRemove={mockOnRemove} />);

        // Check that the file is rendered (if key was wrong, React would warn)
        expect(screen.getByText("file1.pdf")).toBeInTheDocument();
    });

    it("should use _id as key when hash is not available", () => {
        const files = [
            {
                _id: "file1",
                displayFilename: "file1.pdf",
            },
        ];

        render(<AttachedFilesList files={files} onRemove={mockOnRemove} />);

        expect(screen.getByText("file1.pdf")).toBeInTheDocument();
    });

    it("should use index as key when neither hash nor _id is available", () => {
        const files = [
            {
                displayFilename: "file1.pdf",
            },
        ];

        render(<AttachedFilesList files={files} onRemove={mockOnRemove} />);

        expect(screen.getByText("file1.pdf")).toBeInTheDocument();
    });

    it("should render file icons for each file", () => {
        const files = [
            {
                hash: "hash1",
                displayFilename: "file1.pdf",
            },
            {
                hash: "hash2",
                displayFilename: "file2.jpg",
            },
        ];

        render(<AttachedFilesList files={files} onRemove={mockOnRemove} />);

        const icons = screen.getAllByTestId("file-icon");
        expect(icons).toHaveLength(2);
    });

    it("should truncate long filenames with max-w-20 class", () => {
        const files = [
            {
                hash: "hash1",
                displayFilename:
                    "very-long-filename-that-should-be-truncated.pdf",
            },
        ];

        render(<AttachedFilesList files={files} onRemove={mockOnRemove} />);

        const filenameElement = screen.getByText(
            "very-long-filename-that-should-be-truncated.pdf",
        );
        expect(filenameElement).toHaveClass("truncate", "max-w-20");
    });
});
