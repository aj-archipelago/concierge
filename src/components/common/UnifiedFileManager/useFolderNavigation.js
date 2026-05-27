"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";

/**
 * Hook: manages folder navigation state — selected folder, expand/collapse, breadcrumb.
 *
 * @param {Object} options
 * @param {Object} options.tree - The folder tree from useUnifiedFileData
 * @param {string|null} options.chatId - If provided, auto-select chats/{chatId} on mount
 * @param {string|undefined} options.defaultSelectedPath - Initial folder path; "" selects All Files
 * @param {string|undefined} options.rootPathLabel - Optional label for the real root folder
 * @param {string} options.allFilesPath - Path token for the recursive All Files view
 * @returns {Object} Navigation state and actions
 */
export function useFolderNavigation({
    tree,
    chatId = null,
    defaultSelectedPath,
    rootPathLabel,
    allFilesPath = "",
}) {
    // null means "choose a sensible default once data loads"; "" is the
    // explicit "All Files" root, otherwise a path like "global" or "chats/abc123".
    const [selectedPath, setSelectedPath] = useState(
        defaultSelectedPath === undefined ? null : defaultSelectedPath,
    );
    const [expandedPaths, setExpandedPaths] = useState(new Set());
    const initializedChatIdRef = useRef(null);

    // Auto-expand and select chat folder on mount when chatId is provided
    useEffect(() => {
        if (!chatId || !tree || initializedChatIdRef.current === chatId) {
            return;
        }

        const chatPath = `chats/${chatId}`;
        // Check if the path exists in the tree
        const hasChats = !!tree.children?.chats;
        const hasChatFolder =
            hasChats && !!tree.children.chats.children?.[chatId];

        if (hasChatFolder) {
            initializedChatIdRef.current = chatId;
            setSelectedPath(chatPath);
            setExpandedPaths((prev) => new Set([...prev, "chats", chatPath]));
        } else if (hasChats) {
            // Chat folder doesn't exist yet, but chats does — expand chats
            setExpandedPaths((prev) => new Set([...prev, "chats"]));
        }
    }, [chatId, tree]);

    // Default to a real folder instead of the recursive "All Files" root so
    // the main pane starts scoped to one directory. Users can still click
    // All Files explicitly when they want the cross-folder view.
    useEffect(() => {
        if (!tree || selectedPath !== null || chatId) return;
        if (defaultSelectedPath !== undefined) {
            setSelectedPath(defaultSelectedPath);
            return;
        }
        const topLevelPaths = Object.keys(tree.children || {}).sort();
        if (topLevelPaths.includes("global")) {
            setSelectedPath("global");
        } else {
            setSelectedPath(topLevelPaths[0] || "");
        }
    }, [tree, selectedPath, chatId, defaultSelectedPath]);

    // Auto-expand top-level folders on first load
    useEffect(() => {
        if (tree && expandedPaths.size === 0) {
            const topLevelPaths = Object.keys(tree.children);
            if (topLevelPaths.length > 0) {
                setExpandedPaths(new Set(topLevelPaths));
            }
        }
    }, [tree]); // eslint-disable-line react-hooks/exhaustive-deps

    const selectFolder = useCallback((path) => {
        setSelectedPath(path);
    }, []);

    const toggleExpanded = useCallback((path) => {
        setExpandedPaths((prev) => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    }, []);

    const expandFolder = useCallback((path) => {
        setExpandedPaths((prev) => {
            if (prev.has(path)) return prev;
            return new Set([...prev, path]);
        });
    }, []);

    const isExpanded = useCallback(
        (path) => expandedPaths.has(path),
        [expandedPaths],
    );

    const isSelected = useCallback(
        (path) => selectedPath === path,
        [selectedPath],
    );

    /**
     * Breadcrumb segments for the current path.
     * Returns array of { label, path } from root to current.
     */
    const breadcrumbs = useMemo(() => {
        if (selectedPath === allFilesPath) {
            return [{ label: "All Files", path: allFilesPath }];
        }

        const crumbs = [{ label: rootPathLabel || "All Files", path: "" }];
        if (!selectedPath) return crumbs;

        const parts = selectedPath.split("/");
        let currentPath = "";
        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            crumbs.push({ label: part, path: currentPath });
        }
        return crumbs;
    }, [allFilesPath, rootPathLabel, selectedPath]);

    return {
        selectedPath,
        expandedPaths,
        selectFolder,
        toggleExpanded,
        expandFolder,
        isExpanded,
        isSelected,
        breadcrumbs,
    };
}
