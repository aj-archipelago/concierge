"use client";

import React, { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useArticleEditor } from "../../../hooks/useArticleEditor";
import { TabContentLoader } from "./TabContentLoader";

const Write = dynamic(() => import("../../write/Write"), {
    loading: () => (
        <TabContentLoader loading={true} loadingLabel="Loading..." />
    ),
    ssr: false,
});

/**
 * ArticleTabContent — renders the article editor for one canvas tab.
 *
 * The workspace HTML file at `workspacePath` is the source of truth.
 * `workspaceContentVersion` (bumped by Redux on agent edits / file changes)
 * forces useArticleEditor to re-read the file. Only thin metadata is reported
 * back to Redux for tab-bar display and identity tracking.
 */
export default function ArticleTabContent({
    tabId,
    initialContent,
    onContentChange,
    isActive,
    onEditorReady,
}) {
    const workspacePath = initialContent?.workspacePath || null;
    const workspaceContentVersion =
        initialContent?.workspaceContentVersion || null;

    const articleEditor = useArticleEditor(
        workspacePath,
        workspaceContentVersion,
    );
    const { state: articleState } = articleEditor;

    const onContentChangeRef = useRef(onContentChange);
    useEffect(() => {
        onContentChangeRef.current = onContentChange;
    }, [onContentChange]);

    const initialContentType = initialContent?.type;
    const initialContentTitle = initialContent?.title;

    // Report metadata back so the tab bar can show a title and Redux can
    // remember identity. Body fields are no longer persisted to Redux —
    // the workspace file is the source of truth.
    const lastReportedRef = useRef(null);
    useEffect(() => {
        if (!onContentChangeRef.current) return;

        const next = {
            type: initialContentType || "article",
            workspacePath,
            fileHash: articleState.fileHash,
            blobPath: articleState.blobPath,
            filename: articleState.filename,
            title:
                articleState.headline?.trim() ||
                articleState.filename ||
                initialContentTitle ||
                "Canvas",
        };

        const prev = lastReportedRef.current;
        if (
            prev &&
            prev.workspacePath === next.workspacePath &&
            prev.fileHash === next.fileHash &&
            prev.blobPath === next.blobPath &&
            prev.filename === next.filename &&
            prev.title === next.title
        ) {
            return;
        }
        lastReportedRef.current = next;
        onContentChangeRef.current(tabId, next);
    }, [
        tabId,
        workspacePath,
        articleState.fileHash,
        articleState.blobPath,
        articleState.filename,
        articleState.headline,
        initialContentType,
        initialContentTitle,
    ]);

    // Expose editor operations + status to the canvas header when this tab
    // is active. Debounced to avoid rapid-fire reports.
    const onEditorReadyRef = useRef(onEditorReady);
    const lastEditorRef = useRef(null);
    const editorReadyTimeoutRef = useRef(null);

    useEffect(() => {
        onEditorReadyRef.current = onEditorReady;
    }, [onEditorReady]);

    useEffect(() => {
        if (editorReadyTimeoutRef.current) {
            clearTimeout(editorReadyTimeoutRef.current);
            editorReadyTimeoutRef.current = null;
        }

        if (!isActive) {
            if (onEditorReadyRef.current) onEditorReadyRef.current(null);
            lastEditorRef.current = null;
            return;
        }
        if (!onEditorReadyRef.current) return;

        editorReadyTimeoutRef.current = setTimeout(() => {
            const status = articleEditor.documentStatus;
            const next = {
                hasChanges: status.isDirty,
                isSaving: status.isSaving,
                isNewStory: status.isNewStory,
                canSave: status.canSave,
                canRevert: status.canRevert,
            };
            const prev = lastEditorRef.current;
            const changed =
                !prev ||
                prev.hasChanges !== next.hasChanges ||
                prev.isSaving !== next.isSaving ||
                prev.isNewStory !== next.isNewStory;
            if (!changed) return;

            lastEditorRef.current = next;
            onEditorReadyRef.current({
                ...next,
                saveFile: articleEditor.operations.saveFile,
                revertChanges: articleEditor.operations.revertChanges,
                deleteFile: articleEditor.operations.deleteFile,
            });
        }, 50);

        return () => {
            if (editorReadyTimeoutRef.current) {
                clearTimeout(editorReadyTimeoutRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabId, isActive, articleEditor.documentStatus]);

    return (
        <div className="h-full" data-tab-id={tabId}>
            <TabContentLoader
                loading={articleEditor.loading.isLoading}
                loadingLabel="Loading article..."
            >
                <Write articleEditor={articleEditor} isActive={isActive} />
            </TabContentLoader>
        </div>
    );
}
