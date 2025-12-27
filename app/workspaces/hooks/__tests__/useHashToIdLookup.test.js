/**
 * @jest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useHashToIdLookup } from "../useHashToIdLookup";
import { useWorkspaceFiles } from "../../../queries/workspaces";

// Mock the workspace files query
jest.mock("../../../queries/workspaces", () => ({
    useWorkspaceFiles: jest.fn(),
}));

describe("useHashToIdLookup", () => {
    let queryClient;

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                },
            },
        });
        jest.clearAllMocks();
    });

    const wrapper = ({ children }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );

    it("should return empty Map when workspaceId is undefined", () => {
        useWorkspaceFiles.mockReturnValue({
            data: undefined,
            isLoading: false,
        });

        const { result } = renderHook(() => useHashToIdLookup(undefined), {
            wrapper,
        });

        expect(result.current).toBeInstanceOf(Map);
        expect(result.current.size).toBe(0);
    });

    it("should return empty Map when no files data", () => {
        useWorkspaceFiles.mockReturnValue({
            data: null,
            isLoading: false,
        });

        const { result } = renderHook(() => useHashToIdLookup("workspace123"), {
            wrapper,
        });

        expect(result.current).toBeInstanceOf(Map);
        expect(result.current.size).toBe(0);
    });

    it("should return empty Map when files array is empty", () => {
        useWorkspaceFiles.mockReturnValue({
            data: { files: [] },
            isLoading: false,
        });

        const { result } = renderHook(() => useHashToIdLookup("workspace123"), {
            wrapper,
        });

        expect(result.current).toBeInstanceOf(Map);
        expect(result.current.size).toBe(0);
    });

    it("should build hash to _id map from workspace files", () => {
        const mockFiles = [
            { _id: "file1", hash: "hash1", filename: "file1.pdf" },
            { _id: "file2", hash: "hash2", filename: "file2.jpg" },
            { _id: "file3", hash: "hash3", filename: "file3.png" },
        ];

        useWorkspaceFiles.mockReturnValue({
            data: { files: mockFiles },
            isLoading: false,
        });

        const { result } = renderHook(() => useHashToIdLookup("workspace123"), {
            wrapper,
        });

        expect(result.current).toBeInstanceOf(Map);
        expect(result.current.size).toBe(3);
        expect(result.current.get("hash1")).toBe("file1");
        expect(result.current.get("hash2")).toBe("file2");
        expect(result.current.get("hash3")).toBe("file3");
    });

    it("should skip files without hash", () => {
        const mockFiles = [
            { _id: "file1", hash: "hash1", filename: "file1.pdf" },
            { _id: "file2", filename: "file2.jpg" }, // No hash
            { _id: "file3", hash: "hash3", filename: "file3.png" },
        ];

        useWorkspaceFiles.mockReturnValue({
            data: { files: mockFiles },
            isLoading: false,
        });

        const { result } = renderHook(() => useHashToIdLookup("workspace123"), {
            wrapper,
        });

        expect(result.current.size).toBe(2);
        expect(result.current.get("hash1")).toBe("file1");
        expect(result.current.get("hash3")).toBe("file3");
        expect(result.current.has("file2")).toBe(false);
    });

    it("should skip files without _id", () => {
        const mockFiles = [
            { _id: "file1", hash: "hash1", filename: "file1.pdf" },
            { hash: "hash2", filename: "file2.jpg" }, // No _id
            { _id: "file3", hash: "hash3", filename: "file3.png" },
        ];

        useWorkspaceFiles.mockReturnValue({
            data: { files: mockFiles },
            isLoading: false,
        });

        const { result } = renderHook(() => useHashToIdLookup("workspace123"), {
            wrapper,
        });

        expect(result.current.size).toBe(2);
        expect(result.current.get("hash1")).toBe("file1");
        expect(result.current.get("hash3")).toBe("file3");
        expect(result.current.has("hash2")).toBe(false);
    });

    it("should update when workspace files data changes", () => {
        const initialFiles = [
            { _id: "file1", hash: "hash1", filename: "file1.pdf" },
        ];

        useWorkspaceFiles.mockReturnValue({
            data: { files: initialFiles },
            isLoading: false,
        });

        const { result, rerender } = renderHook(
            () => useHashToIdLookup("workspace123"),
            { wrapper },
        );

        expect(result.current.size).toBe(1);
        expect(result.current.get("hash1")).toBe("file1");

        // Update files
        const updatedFiles = [
            { _id: "file1", hash: "hash1", filename: "file1.pdf" },
            { _id: "file2", hash: "hash2", filename: "file2.jpg" },
        ];

        useWorkspaceFiles.mockReturnValue({
            data: { files: updatedFiles },
            isLoading: false,
        });

        rerender();

        expect(result.current.size).toBe(2);
        expect(result.current.get("hash1")).toBe("file1");
        expect(result.current.get("hash2")).toBe("file2");
    });

    it("should handle duplicate hashes (use last occurrence)", () => {
        const mockFiles = [
            { _id: "file1", hash: "hash1", filename: "file1.pdf" },
            { _id: "file2", hash: "hash1", filename: "file2.jpg" }, // Duplicate hash
        ];

        useWorkspaceFiles.mockReturnValue({
            data: { files: mockFiles },
            isLoading: false,
        });

        const { result } = renderHook(() => useHashToIdLookup("workspace123"), {
            wrapper,
        });

        // Should use the last occurrence
        expect(result.current.size).toBe(1);
        expect(result.current.get("hash1")).toBe("file2");
    });
});
