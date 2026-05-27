import { renderHook, waitFor, act } from "@testing-library/react";
import { useFolderNavigation } from "../useFolderNavigation";

describe("useFolderNavigation", () => {
    test("defaults to a top-level folder instead of All Files", async () => {
        const tree = {
            children: {
                chats: { children: {}, files: [], path: "chats" },
                global: { children: {}, files: [], path: "global" },
            },
        };

        const { result } = renderHook(() => useFolderNavigation({ tree }));

        await waitFor(() => {
            expect(result.current.selectedPath).toBe("global");
        });
    });

    test("keeps All Files as an explicit user selection", async () => {
        const tree = {
            children: {
                global: { children: {}, files: [], path: "global" },
            },
        };

        const { result } = renderHook(() => useFolderNavigation({ tree }));

        await waitFor(() => {
            expect(result.current.selectedPath).toBe("global");
        });

        act(() => {
            result.current.selectFolder("");
        });

        expect(result.current.selectedPath).toBe("");
    });

    test("can default to All Files", () => {
        const tree = {
            children: {
                global: { children: {}, files: [], path: "global" },
            },
        };

        const { result } = renderHook(() =>
            useFolderNavigation({ tree, defaultSelectedPath: "" }),
        );

        expect(result.current.selectedPath).toBe("");
        expect(result.current.breadcrumbs).toEqual([
            { label: "All Files", path: "" },
        ]);
    });

    test("does not force the chat folder again after user navigation", async () => {
        const createTree = () => ({
            children: {
                chats: {
                    children: {
                        "chat-1": {
                            children: {},
                            files: [],
                            path: "chats/chat-1",
                        },
                    },
                    files: [],
                    path: "chats",
                },
                global: { children: {}, files: [], path: "global" },
            },
        });

        const { result, rerender } = renderHook(
            ({ tree }) => useFolderNavigation({ tree, chatId: "chat-1" }),
            { initialProps: { tree: createTree() } },
        );

        await waitFor(() => {
            expect(result.current.selectedPath).toBe("chats/chat-1");
        });

        act(() => {
            result.current.selectFolder("chats");
        });
        expect(result.current.selectedPath).toBe("chats");

        rerender({ tree: createTree() });

        expect(result.current.selectedPath).toBe("chats");
    });

    test("can label the real root separately from recursive All Files", () => {
        const tree = {
            children: {
                nested: { children: {}, files: [], path: "nested" },
            },
        };

        const { result } = renderHook(() =>
            useFolderNavigation({
                tree,
                defaultSelectedPath: "",
                rootPathLabel: "media",
                allFilesPath: "__all_files__",
            }),
        );

        expect(result.current.selectedPath).toBe("");
        expect(result.current.breadcrumbs).toEqual([
            { label: "media", path: "" },
        ]);

        act(() => {
            result.current.selectFolder("__all_files__");
        });

        expect(result.current.breadcrumbs).toEqual([
            { label: "All Files", path: "__all_files__" },
        ]);
    });
});
