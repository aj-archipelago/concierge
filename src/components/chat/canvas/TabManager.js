"use client";

import React from "react";
import ArticleTabContent from "./ArticleTabContent";
import HtmlPreviewTabContent from "./HtmlPreviewTabContent";
import FilePreviewTabContent from "./FilePreviewTabContent";
import EmptyTabContent from "./EmptyTabContent";

/**
 * TabManager - Manages rendering of all canvas tabs
 *
 * Key Strategy: Renders ALL tabs simultaneously but hides inactive ones with CSS.
 * This preserves React component state and hook instances when switching tabs.
 *
 * Why display:none instead of conditional rendering:
 * - Preserves component state when switching tabs
 * - Maintains hook instances (useArticleEditor) per tab
 * - Prevents remounting and loss of unsaved changes
 * - Faster tab switching (no re-initialization)
 */
export default function TabManager({
    tabs,
    activeTabId,
    onTabUpdate,
    onEditorReady,
    onFileSelect,
    onNewArticle,
    onCreateApplet,
    isGeneratingApplet,
    chatTitleMap,
    refreshKey,
    isMobile,
    onCloseCanvas,
}) {
    return (
        <>
            {tabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                const content = tab.content || {};
                const contentType = content.type || "empty";

                // For article/story tabs, include the workspacePath in the key
                // so the component fully remounts when the underlying file
                // identity changes. workspaceContentVersion stays as a prop —
                // useArticleEditor watches it and re-reads the file in place.
                const isArticleType =
                    contentType === "article" || contentType === "story";
                const tabKey = isArticleType
                    ? `${tab.id}-${content?.workspacePath || "init"}`
                    : tab.id;

                let inner;
                switch (contentType) {
                    case "article":
                    case "story":
                        inner = (
                            <ArticleTabContent
                                tabId={tab.id}
                                initialContent={content}
                                onContentChange={onTabUpdate}
                                isActive={isActive}
                                onEditorReady={onEditorReady}
                            />
                        );
                        break;
                    case "html":
                        inner = (
                            <HtmlPreviewTabContent
                                tabId={tab.id}
                                initialContent={content}
                                onContentChange={onTabUpdate}
                                isActive={isActive}
                                onCloseCanvas={onCloseCanvas}
                            />
                        );
                        break;
                    case "file":
                        inner = (
                            <FilePreviewTabContent
                                tabId={tab.id}
                                initialContent={content}
                                isActive={isActive}
                            />
                        );
                        break;
                    case "empty":
                    default:
                        inner = (
                            <EmptyTabContent
                                isMobile={isMobile}
                                onFileSelect={onFileSelect}
                                onNewArticle={onNewArticle}
                                onCreateApplet={onCreateApplet}
                                isGeneratingApplet={isGeneratingApplet}
                                chatTitleMap={chatTitleMap}
                                refreshKey={refreshKey}
                            />
                        );
                        break;
                }

                return (
                    <div
                        key={tabKey}
                        style={{
                            display: isActive ? "flex" : "none",
                            flexDirection: "column",
                            height: "100%",
                        }}
                        data-tab-id={tab.id}
                        data-active={isActive}
                    >
                        {inner}
                    </div>
                );
            })}
        </>
    );
}
