"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Filter } from "lucide-react";
import axios from "@/app/utils/axios-client";
import FolderBrowser from "@/src/components/common/FolderBrowser";

/**
 * CanvasFileBrowser - File browser for the canvas sidebar.
 *
 * Defaults to showing only applets and articles. The "Show all files" toggle
 * removes the filter. Applet files are renamed in-place using the applet's
 * display name (parallel to chatTitleMap for chat folders).
 *
 * @param {Object} props
 * @param {Function} props.onFileSelect - Called with (file) when user selects a file to open in canvas
 * @param {string} props.containerHeight - CSS height for the scrollable area (default: 100%)
 * @param {Object} props.chatTitleMap - Map of chatId -> title for folder labels (optional)
 * @param {number} props.refreshKey - When changed, triggers a file list refresh
 */
export default function CanvasFileBrowser({
    onFileSelect,
    containerHeight,
    chatTitleMap = {},
    refreshKey,
}) {
    const { t } = useTranslation();
    const [showAll, setShowAll] = useState(false);
    // Identifier of the file currently being opened in canvas, so we can show a
    // spinner on the row while async work (fetch/parse) finishes.
    const [loadingFileKey, setLoadingFileKey] = useState(null);

    // Pull the user's canvas applets so we can (a) flag applet files in the
    // listing and (b) substitute the raw filename with the applet's display
    // name. Keys are hash and blobPath since the file listing exposes both.
    const { data: appletsData } = useQuery({
        queryKey: ["canvas-applets"],
        queryFn: async () => {
            const res = await axios.get("/api/canvas-applets");
            return res.data;
        },
        staleTime: 60_000,
    });

    const { appletKeySet, appletTitleMap, appletIdMap } = useMemo(() => {
        const keySet = new Set();
        const titleMap = {};
        const idMap = {};
        for (const applet of appletsData?.applets || []) {
            const name = applet?.name;
            const id = applet?._id;
            if (!name) continue;
            for (const key of [applet.fileHash, applet.fileBlobPath]) {
                if (key) {
                    keySet.add(key);
                    titleMap[key] = name;
                    if (id) idMap[key] = String(id);
                }
            }
        }
        return {
            appletKeySet: keySet,
            appletTitleMap: titleMap,
            appletIdMap: idMap,
        };
    }, [appletsData]);

    // Article files live under any "/articles/" folder in storage.
    const isArticleFile = useCallback(
        (file) => /(^|\/)articles\//i.test(file?.name || ""),
        [],
    );

    // Only match files DIRECTLY under an applets/ folder (no nested subfolders),
    // or files that are explicitly registered as an applet by hash/blobPath/name.
    // The default filter hides nested folders under applets/ to keep the picker
    // focused on the actual applet entry points; "Show all" reveals everything.
    const isAppletFile = useCallback(
        (file) => {
            const name = file?.name || "";
            if (/(^|\/)applets\/[^/]+$/i.test(name)) return true;
            return (
                (file?.hash && appletKeySet.has(file.hash)) ||
                (file?.blobPath && appletKeySet.has(file.blobPath)) ||
                (name && appletKeySet.has(name))
            );
        },
        [appletKeySet],
    );

    const fileFilter = useMemo(() => {
        if (showAll) return null;
        return (file) => isArticleFile(file) || isAppletFile(file);
    }, [showAll, isArticleFile, isAppletFile]);

    const getDisplayName = useCallback(
        (file) => {
            return (
                (file?.hash && appletTitleMap[file.hash]) ||
                (file?.blobPath && appletTitleMap[file.blobPath]) ||
                (file?.name && appletTitleMap[file.name]) ||
                null
            );
        },
        [appletTitleMap],
    );

    const handleFileSelect = useCallback(
        async (file) => {
            if (
                !onFileSelect ||
                (!file?.converted?.hash &&
                    !file?.hash &&
                    !file?.converted?.url &&
                    !file?.url)
            ) {
                return;
            }
            const resolvedHash = file.converted?.hash || file.hash;
            const resolvedBlobPath =
                file.converted?.blobPath || file.blobPath || null;
            const appletId =
                (resolvedHash && appletIdMap[resolvedHash]) ||
                (resolvedBlobPath && appletIdMap[resolvedBlobPath]) ||
                (file.name && appletIdMap[file.name]) ||
                null;
            const normalized = {
                ...file,
                hash: resolvedHash,
                url: file.converted?.url || file.url,
                blobPath: resolvedBlobPath,
                displayFilename:
                    file.displayFilename || file.displayName || file.filename,
                filename:
                    file.filename || file.displayFilename || file.displayName,
                mimeType: file.mimeType || file.contentType,
                name: file.name,
                workspacePath: file.workspacePath,
                appletId,
            };
            // Match the FolderBrowser getFileKey priority so the spinner shows
            // on the right row even though we may be sending a normalized copy.
            const key =
                resolvedBlobPath ||
                resolvedHash ||
                normalized.url ||
                file.name ||
                null;
            setLoadingFileKey(key);
            try {
                await onFileSelect(normalized);
            } finally {
                setLoadingFileKey(null);
            }
        },
        [onFileSelect, appletIdMap],
    );

    return (
        <div className="h-full min-h-0 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 dark:border-gray-700">
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {showAll ? t("All files") : t("Applets & articles")}
                </span>
                <button
                    onClick={() => setShowAll((v) => !v)}
                    className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                    title={
                        showAll
                            ? t("Show only applets and articles")
                            : t("Show all files")
                    }
                >
                    <Filter className="w-3 h-3" />
                    {showAll ? t("Filter") : t("Show all")}
                </button>
            </div>
            <FolderBrowser
                mode="select"
                chatTitleMap={chatTitleMap}
                onFileSelect={handleFileSelect}
                containerHeight={containerHeight || "100%"}
                className="flex-1 min-h-0"
                refreshKey={refreshKey}
                fileFilter={fileFilter}
                getDisplayName={getDisplayName}
                loadingFileKey={loadingFileKey}
            />
        </div>
    );
}
