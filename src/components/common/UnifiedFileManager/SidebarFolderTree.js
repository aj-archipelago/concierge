"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
    ChevronRight,
    ChevronDown,
    Folder,
    FolderOpen,
    Globe,
    MessageSquare,
    FolderRoot,
} from "lucide-react";
import { countFiles } from "./useUnifiedFileData";

/**
 * Get a human-readable label for a folder segment.
 */
function getFolderLabel(segment, chatTitleMap, t) {
    if (segment === "global") return t("Global Files");
    if (segment === "chats") return t("Chat Files");
    if (segment === "workspaces") return t("Workspaces");
    if (chatTitleMap && chatTitleMap[segment]) {
        return chatTitleMap[segment];
    }
    return segment;
}

/**
 * Get the icon for a folder segment.
 */
function getFolderIcon(segment, isOpen) {
    if (segment === "global")
        return <Globe className="w-4 h-4 text-blue-500 flex-shrink-0" />;
    if (segment === "chats")
        return (
            <MessageSquare className="w-4 h-4 text-green-500 flex-shrink-0" />
        );
    if (isOpen)
        return <FolderOpen className="w-4 h-4 text-yellow-500 flex-shrink-0" />;
    return <Folder className="w-4 h-4 text-yellow-500 flex-shrink-0" />;
}

/**
 * Single folder node in the sidebar tree.
 */
function SidebarFolderNode({
    segment,
    node,
    depth,
    chatTitleMap,
    isExpanded,
    isSelected,
    onToggleExpand,
    onSelect,
    expandedPaths,
    selectedPath,
}) {
    const { t } = useTranslation();
    const childFolders = useMemo(
        () => Object.keys(node.children).sort(),
        [node.children],
    );
    const hasChildren = childFolders.length > 0;
    const expanded = isExpanded(node.path);
    const selected = isSelected(node.path);
    const fileCount = countFiles(node);
    const label = getFolderLabel(segment, chatTitleMap, t);

    return (
        <div>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect(node.path);
                    if (hasChildren && !expanded) {
                        onToggleExpand(node.path);
                    }
                }}
                className={`w-full flex items-center gap-1.5 py-1.5 px-2 rounded text-sm transition-colors min-w-0 overflow-hidden ${
                    selected
                        ? "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                }`}
                style={{ paddingInlineStart: `${depth * 14 + 8}px` }}
            >
                {hasChildren ? (
                    <span
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleExpand(node.path);
                        }}
                        className="flex-shrink-0 p-0.5 -m-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                    >
                        {expanded ? (
                            <ChevronDown className="w-3 h-3 text-gray-400" />
                        ) : (
                            <ChevronRight className="w-3 h-3 text-gray-400" />
                        )}
                    </span>
                ) : (
                    <span className="w-3 flex-shrink-0" />
                )}
                {getFolderIcon(segment, expanded)}
                <span className="truncate font-medium" title={label}>
                    {label}
                </span>
                <span className="text-[10px] text-gray-400 ms-auto flex-shrink-0 tabular-nums">
                    {fileCount}
                </span>
            </button>

            {expanded && hasChildren && (
                <div>
                    {childFolders.map((childKey) => (
                        <SidebarFolderNode
                            key={childKey}
                            segment={childKey}
                            node={node.children[childKey]}
                            depth={depth + 1}
                            chatTitleMap={chatTitleMap}
                            isExpanded={isExpanded}
                            isSelected={isSelected}
                            onToggleExpand={onToggleExpand}
                            onSelect={onSelect}
                            expandedPaths={expandedPaths}
                            selectedPath={selectedPath}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * SidebarFolderTree - folder navigation sidebar for the unified file manager.
 *
 * @param {Object} props
 * @param {Object} props.tree - Folder tree from useUnifiedFileData
 * @param {Object} props.chatTitleMap - Map of chatId -> chat title
 * @param {number} props.totalFileCount - Total number of files
 * @param {Function} props.isExpanded - Check if path is expanded
 * @param {Function} props.isSelected - Check if path is selected
 * @param {Function} props.onToggleExpand - Toggle expand on a path
 * @param {Function} props.onSelect - Select a folder path
 * @param {Set} props.expandedPaths - Set of expanded paths
 * @param {string} props.selectedPath - Currently selected path
 * @param {string|undefined} props.rootFolderLabel - Optional label for the real root folder
 * @param {string} props.allFilesPath - Path token for recursive All Files
 */
export default function SidebarFolderTree({
    tree,
    chatTitleMap = {},
    totalFileCount = 0,
    isExpanded,
    isSelected,
    onToggleExpand,
    onSelect,
    expandedPaths,
    selectedPath,
    rootFolderLabel,
    allFilesPath = "",
}) {
    const { t } = useTranslation();
    const topFolders = useMemo(
        () => Object.keys(tree.children).sort(),
        [tree.children],
    );
    const rootSelected = isSelected("");
    const allFilesSelected = isSelected(allFilesPath);
    const rootFileCount = tree.files?.length || 0;
    const allFilesLabel = t("All Files");

    return (
        <div className="flex flex-col overflow-y-auto overflow-x-hidden py-1 min-w-0">
            {rootFolderLabel && (
                <button
                    onClick={() => onSelect("")}
                    className={`w-full flex items-center gap-1.5 py-1.5 px-2 rounded text-sm transition-colors min-w-0 overflow-hidden ${
                        rootSelected
                            ? "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
                            : "hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                    }`}
                    style={{ paddingInlineStart: "8px" }}
                >
                    <span className="w-3 flex-shrink-0" />
                    <FolderRoot className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span
                        className="truncate font-medium"
                        title={rootFolderLabel}
                    >
                        {rootFolderLabel}
                    </span>
                    <span className="text-[10px] text-gray-400 ms-auto flex-shrink-0 tabular-nums">
                        {rootFileCount}
                    </span>
                </button>
            )}

            {/* "All Files" recursive entry */}
            <button
                onClick={() => onSelect(allFilesPath)}
                className={`w-full flex items-center gap-1.5 py-1.5 px-2 rounded text-sm transition-colors min-w-0 overflow-hidden ${
                    allFilesSelected
                        ? "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                }`}
                style={{ paddingInlineStart: rootFolderLabel ? "22px" : "8px" }}
            >
                <span className="w-3 flex-shrink-0" />
                <FolderRoot className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <span className="truncate font-medium" title={allFilesLabel}>
                    {allFilesLabel}
                </span>
                <span className="text-[10px] text-gray-400 ms-auto flex-shrink-0 tabular-nums">
                    {totalFileCount}
                </span>
            </button>

            {/* Top-level folders */}
            {topFolders.map((folderKey) => (
                <SidebarFolderNode
                    key={folderKey}
                    segment={folderKey}
                    node={tree.children[folderKey]}
                    depth={1}
                    chatTitleMap={chatTitleMap}
                    isExpanded={isExpanded}
                    isSelected={isSelected}
                    onToggleExpand={onToggleExpand}
                    onSelect={onSelect}
                    expandedPaths={expandedPaths}
                    selectedPath={selectedPath}
                />
            ))}
        </div>
    );
}
