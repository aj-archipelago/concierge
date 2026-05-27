"use client";

import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
    useContext,
    useMemo,
} from "react";
import { v4 as uuidv4 } from "uuid";
import { useSelector, useDispatch } from "react-redux";
import { X, Save, Loader2, Check, RotateCcw, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
    closeCanvas,
    setCanvasWidth,
    openCanvas,
    addCanvasTab,
    closeCanvasTab,
    switchCanvasTab,
    updateCanvasTab,
    incrementFileBrowserRefresh,
    setCanvasVisibility,
} from "../../stores/chatSlice";
import { AuthContext } from "../../App";
import { useFileCollection } from "../../../app/workspaces/[id]/components/useFileCollection";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "react-toastify";
import { deleteFileFromCloud } from "../../../app/workspaces/[id]/components/chatFileUtils";
import TabManager from "./canvas/TabManager";
import GenerateHtmlDialog from "./canvas/GenerateHtmlDialog";
import { uploadFileToMediaHelper } from "../../utils/fileUploadUtils";
import { createChatStorageTarget } from "../../utils/storageTargets";
import { launchAppletGeneration } from "../../utils/appletGeneration";
import {
    useGetActiveChatId,
    useGetActiveChats,
} from "../../../app/queries/chats";
import { getDownloadUrl } from "../../utils/fileDownloadUtils";
import { getTextProxyUrl } from "../../utils/proxyUrl";
import axios from "../../../app/utils/axios-client";
import { useTask, useRunTask } from "../../../app/queries/notifications";
import { usePageContext } from "../../contexts/PageContextProvider";
import {
    IMAGE_CONTEXTUAL_TOOLS,
    IMAGE_TOOL_HANDLERS,
} from "../../../app/chat/imageTools";
import {
    CANVAS_CONTEXTUAL_TOOLS,
    CANVAS_TOOL_HANDLERS,
    HTML_CONTEXTUAL_TOOLS,
    HTML_TOOL_HANDLERS,
} from "../../../app/chat/canvasTools";

// Note: Write component is now dynamically imported within ArticleTabContent
// No need to import it here anymore

// Build a canonical /workspace/files/... path for an article file, or null if
// the file isn't an article. The listing returns file.name with the user
// prefix (users/{userId}/...), so a naive `/workspace/files/{name}` would not
// match the article-editor's expected `/workspace/files/articles/...` form.
// We accept any /articles/ segment in the resulting path so both AI-created
// articles (no user prefix) and listing-sourced articles (with prefix) open
// in the editor.
function buildArticleWorkspacePath(file) {
    const raw = file?.workspacePath || file?.blobPath || file?.name;
    if (!raw || typeof raw !== "string") return null;
    const path = raw.startsWith("/workspace/files/")
        ? raw
        : `/workspace/files/${raw.replace(/^\/+/, "")}`;
    return /\/articles\//.test(path) ? path : null;
}

/**
 * Canvas component - Container for canvas tabs with isolated state management
 *
 * REFACTORED ARCHITECTURE (Feb 2026):
 * - Canvas is now a container component that manages tabs
 * - Each tab (ArticleTabContent, ImageTabContent) has its own isolated state
 * - TabManager renders all tabs with display:none for inactive (preserves state)
 * - No shared useArticleEditor hook - each ArticleTabContent has its own instance
 * - Redux only stores minimal tab metadata (type, title, fileHash)
 * - Full article content lives in tab component hooks, not Redux
 *
 * TODO for full implementation:
 * - Move save/delete/revert buttons into ArticleTabContent
 * - Move image editing UI into ImageTabContent
 * - Remove legacy button handlers from this container
 *
 * Benefits:
 * - True tab isolation - editing one tab cannot affect another
 * - No state leaks or race conditions between tabs
 * - Faster tab switching (components stay mounted)
 */
export default function Canvas({ selectedEntityId }) {
    const { t } = useTranslation();
    const dispatch = useDispatch();
    const { user } = useContext(AuthContext);
    const activeChatId = useGetActiveChatId();
    const { data: activeChats } = useGetActiveChats();
    const chatTitleMap = useMemo(() => {
        const map = {};
        if (activeChats) {
            for (const chat of activeChats) {
                if (chat._id && chat.title) {
                    map[chat._id] = chat.title;
                }
            }
        }
        return map;
    }, [activeChats]);

    const getCanvasTabDisplayTitle = useCallback(
        (tab) => {
            if (
                tab.content?.type === "html" &&
                tab.content?.htmlStatus === "generating"
            ) {
                return t("Generating applet...");
            }
            return tab.title;
        },
        [t],
    );

    const canvasContent = useSelector((state) => state.chat?.canvasContent);
    const canvasTabs = useSelector((state) => state.chat?.canvasTabs || []);
    const activeTabId = useSelector((state) => state.chat?.activeTabId);
    const canvasWidth = useSelector((state) => state.chat?.canvasWidth);
    const canvasVisible = useSelector((state) => state.chat?.canvasVisible);
    const fileBrowserRefreshKey = useSelector(
        (state) => state.chat?.fileBrowserRefreshKey ?? 0,
    );

    // State to track active article tab's editor (for tab-strip buttons)
    const [activeArticleEditor, setActiveArticleEditor] = useState(null);
    const activeArticleEditorRef = useRef(null);

    // Status + actions reported by the active HTML preview tab
    const [isResizing, setIsResizing] = useState(false);
    const resizeRef = useRef(null);
    const MIN_WIDTH_PERCENT = 20; // Minimum 20% of viewport
    const MAX_WIDTH_PERCENT = 80; // Maximum 80% of viewport

    // Mobile detection
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    // Initialize tabs from existing canvasContent if tabs are empty but content exists
    useEffect(() => {
        if (canvasContent && canvasTabs.length === 0 && !activeTabId) {
            // Create a tab from existing content
            dispatch(
                addCanvasTab({
                    ...canvasContent,
                    title:
                        canvasContent.title ||
                        canvasContent.filename ||
                        t("Canvas") ||
                        "Canvas",
                }),
            );
        }
    }, [canvasContent, canvasTabs.length, activeTabId, dispatch, t]);

    // Get active tab content for reference
    // Note: We no longer maintain shared article state here
    // Each tab component manages its own state via isolated hooks
    const activeTab = canvasTabs.find((tab) => tab.id === activeTabId);
    const displayContent =
        activeTabId && activeTab ? activeTab.content : canvasContent;

    // Legacy references for backward compatibility with some UI elements
    // These are now managed per-tab in tab components
    const currentFileHash = displayContent?.fileHash;
    const currentFilename = displayContent?.filename || displayContent?.title;

    // State persistence is now handled by individual tab components
    // Each ArticleTabContent reports its own state changes via onTabUpdate callback
    // This eliminates the cascading re-render loop that caused tab interference
    const [showCheckmark, setShowCheckmark] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showDiscardDialog, setShowDiscardDialog] = useState(false);

    // Rename dialog state
    const [showRenameDialog, setShowRenameDialog] = useState(false);
    const [renameValue, setRenameValue] = useState("");
    const [isRenaming, setIsRenaming] = useState(false);
    const [, setIsDeleting] = useState(false);

    // Image generation dialog state
    const [, setShowModifyImageDialog] = useState(false);
    const [modifyImageTaskId, setModifyImageTaskId] = useState(null);
    const [, setModifyImageError] = useState(null);
    const [isGeneratingApplet, setIsGeneratingApplet] = useState(false);
    const [showCreateAppletDialog, setShowCreateAppletDialog] = useState(false);
    const { data: modifyTaskData } = useTask(modifyImageTaskId);

    // Image editing state - per tab
    const [imageTransforms, setImageTransforms] = useState({});
    const [showAdjustmentsPopover, setShowAdjustmentsPopover] = useState(false);
    const adjustmentsPopoverRef = useRef(null);
    const [showRotatePopover, setShowRotatePopover] = useState(false);
    const rotatePopoverRef = useRef(null);
    const imageRef = useRef(null);

    // Default transform values
    const defaultTransform = useMemo(
        () => ({
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            brightness: 100,
            contrast: 100,
            saturation: 100,
        }),
        [],
    );

    // Get current tab's image transform
    const getImageTransform = useCallback(() => {
        // Use activeTabId if available, otherwise use 'default' for non-tab mode
        const tabKey = activeTabId || "default";
        return imageTransforms[tabKey] || defaultTransform;
    }, [activeTabId, imageTransforms, defaultTransform]);

    const setImageTransform = useCallback(
        (updater) => {
            // Use activeTabId if available, otherwise use a default key for non-tab mode
            const tabKey = activeTabId || "default";
            setImageTransforms((prev) => ({
                ...prev,
                [tabKey]:
                    typeof updater === "function"
                        ? updater(prev[tabKey] || defaultTransform)
                        : updater,
            }));
        },
        [activeTabId, defaultTransform],
    );

    const imageTransform = getImageTransform();

    // File collection - use global context for all files
    const baseContextId = user?.contextId || null;

    const { reloadFiles } = useFileCollection({
        contextId: baseContextId,
    });

    // Use refs to always get the latest values, avoiding stale closure issues
    const activeTabIdRef = useRef(activeTabId);
    const canvasTabsRef = useRef(canvasTabs);
    const selectedEntityIdRef = useRef(selectedEntityId);

    // Refs for functions used before definition to avoid no-use-before-define errors
    const handleNewTabRef = useRef(null);
    const handleNewArticleRef = useRef(null);
    const handleRenameClickRef = useRef(null);
    const handleDeleteClickRef = useRef(null);
    const handleImageDownloadRef = useRef(null);
    const handleFileSelectRef = useRef(null);
    const handleImageModifiedRef = useRef(null);
    const handleCreateAppletRef = useRef(null);

    // Stable callbacks that call refs to avoid recreating functions on every render
    const onCreateAppletClick = useCallback(() => {
        handleCreateAppletRef.current?.();
    }, []);

    const onNewArticleClick = useCallback(() => {
        handleNewArticleRef.current?.();
    }, []);

    const onFileSelectFromBrowser = useCallback((file) => {
        // Return the promise so callers (e.g. CanvasFileBrowser's loading
        // spinner) can await async work like fetching/parsing the file.
        return handleFileSelectRef.current?.(file);
    }, []);

    // All hooks must be defined before any conditional returns
    useEffect(() => {
        activeTabIdRef.current = activeTabId;
    }, [activeTabId]);

    useEffect(() => {
        canvasTabsRef.current = canvasTabs;
    }, [canvasTabs]);

    useEffect(() => {
        selectedEntityIdRef.current = selectedEntityId;
    }, [selectedEntityId]);

    // Set up page context for image editing when an image is active in canvas
    const { setPageContext, clearPageContext } = usePageContext();
    const runTask = useRunTask();
    const isImageActive = useMemo(() => {
        const result =
            (displayContent || canvasContent)?.type === "image" &&
            (displayContent || canvasContent)?.url;
        return result;
    }, [displayContent, canvasContent]);

    const isHtmlActive = useMemo(() => {
        return (displayContent || canvasContent)?.type === "html";
    }, [displayContent, canvasContent]);

    const isArticleActive = useMemo(() => {
        return (displayContent || canvasContent)?.type === "article";
    }, [displayContent, canvasContent]);

    const htmlWorkspacePathRef = useRef(null);
    const htmlFilenameRef = useRef(null);
    const htmlAppletIdRef = useRef(null);
    const htmlAppletActiveVersionNumberRef = useRef(null);
    const htmlAppletIsViewingDraftRef = useRef(null);
    useEffect(() => {
        const content = displayContent || canvasContent;
        if (content?.type === "html") {
            htmlWorkspacePathRef.current = content.workspacePath || null;
            htmlFilenameRef.current = content.filename || content.title || null;
            htmlAppletIdRef.current = content.appletId || null;
            htmlAppletActiveVersionNumberRef.current =
                typeof content.appletActiveVersionNumber === "number"
                    ? content.appletActiveVersionNumber
                    : null;
            htmlAppletIsViewingDraftRef.current =
                typeof content.appletIsViewingDraft === "boolean"
                    ? content.appletIsViewingDraft
                    : null;
        } else {
            htmlWorkspacePathRef.current = null;
            htmlFilenameRef.current = null;
            htmlAppletIdRef.current = null;
            htmlAppletActiveVersionNumberRef.current = null;
            htmlAppletIsViewingDraftRef.current = null;
        }
    }, [
        displayContent,
        canvasContent,
        displayContent?.workspacePath,
        canvasContent?.workspacePath,
        displayContent?.filename,
        canvasContent?.filename,
        displayContent?.title,
        canvasContent?.title,
        displayContent?.appletId,
        canvasContent?.appletId,
        displayContent?.appletActiveVersionNumber,
        canvasContent?.appletActiveVersionNumber,
        displayContent?.appletIsViewingDraft,
        canvasContent?.appletIsViewingDraft,
    ]);

    const getHtmlPageContextRef = useRef(() => {
        const path = htmlWorkspacePathRef.current;
        if (!path) return null;
        const filename = htmlFilenameRef.current;
        let context = `## HTML Canvas Context\n\nAn HTML file is currently loaded in the canvas (right side of the chat window).\n\n**File Information:**\n- **Type:** HTML / Applet\n- **Workspace path:** ${path}\n`;
        if (filename) {
            context += `- **Filename:** ${filename}\n`;
        }
        if (htmlAppletIdRef.current) {
            context += `- **Applet ID:** ${htmlAppletIdRef.current}\n`;
            if (htmlAppletIsViewingDraftRef.current === true) {
                context += `- **Current applet view:** Draft\n`;
            } else if (htmlAppletActiveVersionNumberRef.current) {
                context += `- **Current applet view:** Saved version v${htmlAppletActiveVersionNumberRef.current}\n`;
            }
        }
        context += `\nYou can edit it using bash commands (e.g. \`cat ${path}\`, \`echo '...' > ${path}\`, or use sed/awk). Use this exact workspace path; do not substitute a guessed /global/ path. The canvas preview refreshes from the workspace automatically after tool runs.`;
        if (htmlAppletIdRef.current) {
            context += ` Because this HTML tab is linked to an applet Draft (id: ${htmlAppletIdRef.current}), use **GetAppletState** to inspect Draft/version/publish state, **SaveAppletDraftAsVersion** to checkpoint Draft as an immutable version, **CopyAppletVersionToDraft** to copy a saved version into Draft, **PublishAppletVersion** to publish a saved version, and **DeleteApplet** to remove it (the user will be asked to confirm). If the current applet view is a saved version and the user asks to edit that version, call **CopyAppletVersionToDraft**; if they only need the current Draft, call **OpenAppletDraft**. Use **InspectCanvas** only when you need a screenshot, console errors, or network failures.`;
        } else {
            context += ` The user will see the changes automatically. Use **GetCanvasState** for state or **InspectCanvas** if you need a screenshot.`;
        }
        context += ` For the applet architecture, SDK reference, theming rules, and publishing flow, call **LoadSkill** with name "applets".`;
        return context;
    });

    // Article context refs
    const articleBlobPathRef = useRef(null);
    const articleFilenameRef = useRef(null);
    const articleTitleRef = useRef(null);
    const articleWorkspacePathRef = useRef(null);
    useEffect(() => {
        const content = displayContent || canvasContent;
        if (content?.type === "article") {
            articleBlobPathRef.current = content.blobPath || null;
            articleFilenameRef.current = content.filename || null;
            articleTitleRef.current = content.title || content.headline || null;
            articleWorkspacePathRef.current = content.workspacePath || null;
        } else {
            articleBlobPathRef.current = null;
            articleFilenameRef.current = null;
            articleTitleRef.current = null;
            articleWorkspacePathRef.current = null;
        }
    }, [
        displayContent,
        canvasContent,
        displayContent?.blobPath,
        canvasContent?.blobPath,
        displayContent?.filename,
        canvasContent?.filename,
        displayContent?.title,
        canvasContent?.title,
        displayContent?.workspacePath,
        canvasContent?.workspacePath,
    ]);

    const getArticlePageContextRef = useRef(() => {
        const blobPath = articleBlobPathRef.current;
        const filename = articleFilenameRef.current;
        const title = articleTitleRef.current;
        const workspacePath = articleWorkspacePathRef.current;

        let context = `## Article Canvas Context\n\nAn article is currently open in the canvas editor (right side of the chat window).\n\n**Article Information:**\n- **Type:** Article\n`;
        if (title) {
            context += `- **Title:** ${title}\n`;
        }
        if (filename) {
            context += `- **Filename:** ${filename}\n`;
        }
        if (blobPath) {
            context += `- **Storage path:** ${blobPath}\n`;
        }
        if (workspacePath) {
            context += `- **Workspace path:** ${workspacePath}\n`;
        }
        if (workspacePath) {
            context += `\nThe article file at **${workspacePath}** is the single source of truth — edit it with the workspace shell tool. The canvas re-reads the file after each shell write, so the user sees changes live.`;
        } else {
            context += `\nThis article has no workspace path yet. Ask the user (or use **CreateArticle**) to materialize one before editing.`;
        }
        context += ` Use **GetCanvasState** for state or **InspectCanvas** if you need a screenshot of the rendered article. For the article HTML format and styling rules, call **LoadSkill** with name "articles".`;
        return context;
    });

    // Refs to hold current image values for context getter
    const imageUrlRef = useRef((displayContent || canvasContent)?.url || null);
    const imageTitleRef = useRef(
        (displayContent || canvasContent)?.title || null,
    );
    const imageAltRef = useRef((displayContent || canvasContent)?.alt || null);
    const imageFileHashRef = useRef(
        (displayContent || canvasContent)?.fileHash || null,
    );
    const imageFilenameRef = useRef(
        (displayContent || canvasContent)?.filename || null,
    );

    // Update refs when image content changes
    useEffect(() => {
        const currentContent = displayContent || canvasContent;
        if (currentContent?.type === "image") {
            imageUrlRef.current = currentContent.url || null;
            imageTitleRef.current = currentContent.title || null;
            imageAltRef.current = currentContent.alt || null;
            imageFileHashRef.current = currentContent.fileHash || null;
            imageFilenameRef.current = currentContent.filename || null;
        }
    }, [
        displayContent,
        canvasContent,
        displayContent?.url,
        displayContent?.title,
        displayContent?.alt,
        displayContent?.fileHash,
        displayContent?.filename,
        canvasContent?.url,
        canvasContent?.title,
        canvasContent?.alt,
        canvasContent?.fileHash,
        canvasContent?.filename,
    ]);

    // Context getter function for image info - use ref to avoid recreating on every render
    // The function reads from refs, so it always has access to current values
    const getImagePageContextRef = useRef(() => {
        const imageUrl = imageUrlRef.current;
        if (!imageUrl) {
            return null;
        }

        const imageTitle = imageTitleRef.current;
        const imageFilename = imageFilenameRef.current;
        const imageAlt = imageAltRef.current;
        const imageFileHash = imageFileHashRef.current;

        let context = `## Image Canvas Context\n\nAn image is currently loaded in the canvas (right side of the chat window). You can edit this image using the available image editing tools.\n\n**Image Information:**\n- **URL:** ${imageUrl}\n`;
        if (imageTitle) {
            context += `- **Title:** ${imageTitle}\n`;
        }
        if (imageFilename) {
            context += `- **Filename:** ${imageFilename}\n`;
        }
        if (imageAlt) {
            context += `- **Alt text:** ${imageAlt}\n`;
        }
        if (imageFileHash) {
            context += `- **File hash:** ${imageFileHash}\n`;
        }
        context += `\n**Available Image Editing Tools:**\n- **ModifyImage:** Modify the image using AI based on a text description (e.g., "add a sunset sky", "change the background to a beach")\n- **ApplyImageTransform:** Apply visual transformations like rotation, flipping, brightness, contrast, and saturation adjustments\n- **ReplaceImage:** Replace the current image with a new image URL\n- **GetImageInfo:** Get metadata about the current image (URL, title, filename, etc.)\n- **ReadImageContent:** Get file information (hash, URL, filename) for the image. Use your internal file reading tools with this metadata to access the image content\n\n**Important:** When the user asks to edit, modify, change, or transform the image, you should proactively use the appropriate image editing tools. The user can see the changes in real-time in the canvas, so be proactive and make the edits directly rather than asking for confirmation first.`;

        return context;
    });

    // Close adjustments popover when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                adjustmentsPopoverRef.current &&
                !adjustmentsPopoverRef.current.contains(event.target)
            ) {
                setShowAdjustmentsPopover(false);
            }
        };

        if (showAdjustmentsPopover) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => {
                document.removeEventListener("mousedown", handleClickOutside);
            };
        }
    }, [showAdjustmentsPopover]);

    // Close rotate popover when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                rotatePopoverRef.current &&
                !rotatePopoverRef.current.contains(event.target)
            ) {
                setShowRotatePopover(false);
            }
        };

        if (showRotatePopover) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => {
                document.removeEventListener("mousedown", handleClickOutside);
            };
        }
    }, [showRotatePopover]);

    // Handle image modification task completion (for image tools used via chat)
    // Note: ModifyImageDialog handles its own polling internally
    useEffect(() => {
        if (!modifyImageTaskId || !modifyTaskData) return;

        if (modifyTaskData?.status === "completed") {
            // Get the modified image URL and hash
            const imageUrl =
                modifyTaskData.data?.azureUrl ||
                modifyTaskData.data?.url ||
                modifyTaskData.data?.gcsUrl;
            const imageHash = modifyTaskData.data?.hash;

            if (imageUrl) {
                handleImageModifiedRef.current?.(imageUrl, imageHash);
                setModifyImageError(null);
                setModifyImageTaskId(null);
            } else {
                // Poll media items if URL not in task data
                const pollForMediaItem = async () => {
                    let attempts = 0;
                    const maxAttempts = 20;

                    const checkMediaItem = async () => {
                        try {
                            const { data } = await axios.get(
                                `/api/media-items?page=1&limit=100`,
                            );
                            const mediaItem = data?.mediaItems?.find(
                                (item) => item.taskId === modifyImageTaskId,
                            );

                            if (mediaItem) {
                                const imageUrl =
                                    mediaItem.azureUrl ||
                                    mediaItem.url ||
                                    mediaItem.gcsUrl;
                                const imageHash = mediaItem.hash;
                                if (imageUrl) {
                                    handleImageModifiedRef.current?.(
                                        imageUrl,
                                        imageHash,
                                    );
                                    setModifyImageError(null);
                                    setModifyImageTaskId(null);
                                    return true;
                                }
                            }
                        } catch (error) {
                            console.error("Error fetching media item:", {
                                error: error?.message || error?.toString(),
                                errorStack: error?.stack,
                                taskId: modifyImageTaskId,
                            });
                        }
                        return false;
                    };

                    if (await checkMediaItem()) {
                        return;
                    }

                    const interval = setInterval(async () => {
                        attempts++;
                        if (
                            (await checkMediaItem()) ||
                            attempts >= maxAttempts
                        ) {
                            clearInterval(interval);
                            if (attempts >= maxAttempts) {
                                const errorMsg =
                                    modifyTaskData?.error?.message ||
                                    modifyTaskData?.statusText ||
                                    "Media item URL not found after polling";
                                console.error(
                                    "[Canvas] Media item URL not found after polling:",
                                    {
                                        taskId: modifyImageTaskId,
                                        taskData: modifyTaskData,
                                        error: modifyTaskData?.error,
                                        statusText: modifyTaskData?.statusText,
                                    },
                                );
                                toast.error(
                                    t("Image modification failed") +
                                        ": " +
                                        errorMsg ||
                                        `Image modification failed: ${errorMsg}`,
                                );
                                setModifyImageError(errorMsg);
                                setTimeout(() => {
                                    setModifyImageError(null);
                                    setModifyImageTaskId(null);
                                }, 5000);
                            }
                        }
                    }, 1000);

                    return () => clearInterval(interval);
                };

                const timeoutId = setTimeout(pollForMediaItem, 500);
                return () => clearTimeout(timeoutId);
            }
        } else if (modifyTaskData?.status === "failed") {
            const errorMessage =
                modifyTaskData.error?.message ||
                modifyTaskData.error?.toString() ||
                modifyTaskData.statusText ||
                "Image modification failed";
            console.error("Image modification failed:", {
                error: modifyTaskData.error,
                statusText: modifyTaskData.statusText,
                errorMessage,
            });

            // Set error message to display in overlay
            setModifyImageError(errorMessage);

            // Show error toast to user
            toast.error(
                t("Image modification failed") + ": " + errorMessage ||
                    `Image modification failed: ${errorMessage}`,
            );

            // Clear the error and task ID after 5 seconds to allow user to see the error
            setTimeout(() => {
                setModifyImageError(null);
                setModifyImageTaskId(null);
            }, 5000);
        }
    }, [modifyTaskData, modifyImageTaskId, t]);

    // Callback for image tools (used via chat) to enqueue modification tasks
    const handleModifyTaskEnqueued = useCallback((taskId) => {
        setModifyImageTaskId(taskId);
        setModifyImageError(null);
    }, []);

    // Store refs to stable functions to avoid dependency issues
    const setPageContextRef = useRef(setPageContext);
    const clearPageContextRef = useRef(clearPageContext);
    const runTaskRef = useRef(runTask);
    const dispatchRef = useRef(dispatch);
    const handleModifyTaskEnqueuedRef = useRef(handleModifyTaskEnqueued);

    // Update refs when functions change
    useEffect(() => {
        setPageContextRef.current = setPageContext;
        clearPageContextRef.current = clearPageContext;
        runTaskRef.current = runTask;
        dispatchRef.current = dispatch;
        handleModifyTaskEnqueuedRef.current = handleModifyTaskEnqueued;
    }, [
        setPageContext,
        clearPageContext,
        runTask,
        dispatch,
        handleModifyTaskEnqueued,
    ]);

    // Set up page context when canvas has content (image, HTML, article, etc.)
    const hasCanvasContent =
        canvasVisible && canvasTabs.length > 0 && activeTabId;

    useEffect(() => {
        if (!hasCanvasContent) {
            clearPageContextRef.current("chat-canvas");
            return;
        }

        const getActiveCanvasTabContent = () => {
            const tab = canvasTabsRef.current.find(
                (t) => t.id === activeTabIdRef.current,
            );
            return tab?.content || {};
        };

        // Build canvas tool handlers with context (available for all content types)
        const canvasHandlersWithContext = {};
        Object.keys(CANVAS_TOOL_HANDLERS).forEach((name) => {
            canvasHandlersWithContext[name] = async (toolInfo, baseContext) => {
                return CANVAS_TOOL_HANDLERS[name](toolInfo, {
                    ...baseContext,
                    getActiveTabId: () => activeTabIdRef.current,
                    getActiveTabContent: getActiveCanvasTabContent,
                });
            };
        });

        let combinedTools = [...CANVAS_CONTEXTUAL_TOOLS];
        let combinedHandlers = { ...canvasHandlersWithContext };

        if (isImageActive) {
            // Add image-specific tools alongside canvas tools
            combinedTools = [...combinedTools, ...IMAGE_CONTEXTUAL_TOOLS];

            const imageHandlersWithContext = {};
            Object.keys(IMAGE_TOOL_HANDLERS).forEach((toolName) => {
                const originalHandler = IMAGE_TOOL_HANDLERS[toolName];
                imageHandlersWithContext[toolName] = async (
                    toolInfo,
                    baseContext,
                ) => {
                    const imageContext = {
                        ...baseContext,
                        runTask: runTaskRef.current,
                        dispatch: dispatchRef.current,
                        getImageUrl: () => imageUrlRef.current,
                        getImageTitle: () => imageTitleRef.current,
                        getImageAlt: () => imageAltRef.current,
                        getImageFileHash: () => imageFileHashRef.current,
                        getImageFilename: () => imageFilenameRef.current,
                        getImageElement: () => imageRef.current,
                        getImageTransform,
                        setImageTransform,
                        getActiveTabId: () => activeTabIdRef.current,
                        handleModifyTaskEnqueued:
                            handleModifyTaskEnqueuedRef.current,
                    };
                    return originalHandler(toolInfo, imageContext);
                };
            });
            Object.assign(combinedHandlers, imageHandlersWithContext);
        } else if (isHtmlActive) {
            // Add HTML-specific tools alongside canvas tools
            combinedTools = [...combinedTools, ...HTML_CONTEXTUAL_TOOLS];

            const htmlHandlersWithContext = {};
            Object.keys(HTML_TOOL_HANDLERS).forEach((toolName) => {
                const originalHandler = HTML_TOOL_HANDLERS[toolName];
                htmlHandlersWithContext[toolName] = async (
                    toolInfo,
                    baseContext,
                ) => {
                    return originalHandler(toolInfo, {
                        ...baseContext,
                        dispatch: dispatchRef.current,
                        getEntityId: () => selectedEntityIdRef.current,
                        getActiveHtmlContent: getActiveCanvasTabContent,
                        getActiveTabId: () => activeTabIdRef.current,
                    });
                };
            });
            Object.assign(combinedHandlers, htmlHandlersWithContext);
        }

        const contextGetter = isImageActive
            ? () => getImagePageContextRef.current()
            : isHtmlActive
              ? () => getHtmlPageContextRef.current()
              : isArticleActive
                ? () => getArticlePageContextRef.current()
                : null;

        setPageContextRef.current(
            combinedTools,
            null,
            combinedHandlers,
            contextGetter,
            "chat-canvas",
        );

        return () => {
            if (!hasCanvasContent) {
                clearPageContextRef.current("chat-canvas");
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasCanvasContent, isImageActive, isHtmlActive, isArticleActive]);

    const handleFileSelect = useCallback(
        async (file) => {
            if (!file?.hash && !file?.url) return;

            const filename =
                file.displayFilename ||
                file.originalFilename ||
                file.filename ||
                t("Untitled") ||
                "Untitled";

            const isHtmlFile =
                file.mimeType === "text/html" ||
                file.displayFilename?.endsWith(".html") ||
                file.filename?.endsWith(".html");
            const isImage =
                file.mimeType?.startsWith("image/") ||
                [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].some(
                    (ext) =>
                        file.displayFilename?.endsWith(ext) ||
                        file.filename?.endsWith(ext),
                );

            // Read from refs to get the latest values at execution time
            const currentActiveTabId = activeTabIdRef.current;
            const currentCanvasTabs = canvasTabsRef.current;

            let tabId;
            if (
                currentActiveTabId &&
                currentCanvasTabs.some((tab) => tab.id === currentActiveTabId)
            ) {
                tabId = currentActiveTabId;
            } else if (currentCanvasTabs.length > 0) {
                tabId = currentCanvasTabs[0].id;
                dispatch(switchCanvasTab(tabId));
            } else {
                tabId = uuidv4();
            }

            // For HTML files: workspace files containing an /articles/ segment
            // open in the article editor (the file is the source of truth);
            // every other HTML file opens as a read-only preview.
            if (isHtmlFile) {
                if (!file.url) {
                    toast.error(
                        t("Cannot open: file URL not available") ||
                            "Cannot open: file URL not available",
                    );
                    return;
                }
                // Build a canonical /workspace/files/... path. file.name from
                // the listing carries the user prefix (users/{userId}/...), so
                // we prefer the explicit workspacePath, then blobPath, then
                // name. Only treat as an article when an /articles/ segment is
                // present in the resulting path.
                const articleWorkspacePath = buildArticleWorkspacePath(file);
                const workspacePath =
                    articleWorkspacePath ||
                    file.workspacePath ||
                    (file.blobPath
                        ? `/workspace/files/${file.blobPath.replace(/^\/+/, "")}`
                        : file.name
                          ? `/workspace/files/${file.name.replace(/^\/+/, "")}`
                          : null);
                const isArticleFile = !!articleWorkspacePath;

                if (isArticleFile) {
                    dispatch(
                        openCanvas({
                            tabId,
                            type: "article",
                            fileHash: file.hash || null,
                            blobPath: file.blobPath || null,
                            workspacePath: articleWorkspacePath,
                            workspaceContentVersion: Date.now(),
                            filename: filename,
                            title: filename,
                        }),
                    );
                    return;
                }

                if (!workspacePath) {
                    toast.error(
                        t("Cannot open: file path not available") ||
                            "Cannot open: file path not available",
                    );
                    return;
                }
                try {
                    const fetchUrl = getTextProxyUrl(file.url);
                    const response = await fetch(fetchUrl);
                    if (!response.ok) {
                        throw new Error(response.statusText);
                    }
                    const htmlContent = await response.text();
                    dispatch(
                        openCanvas({
                            tabId,
                            type: "html",
                            title: filename,
                            filename: filename,
                            url: file.url,
                            workspacePath,
                            htmlContent,
                            htmlStatus: "live",
                            appletId: file.appletId || null,
                            fileHash: file.hash || null,
                            blobPath: file.blobPath || null,
                        }),
                    );
                } catch (err) {
                    console.error("Error loading HTML file:", err);
                    toast.error(
                        err.message ||
                            t("Failed to open HTML file") ||
                            "Failed to open HTML file",
                    );
                }
                return;
            }

            if (isImage) {
                if (!file.url) {
                    toast.error(
                        t("Cannot open: file URL not available") ||
                            "Cannot open: file URL not available",
                    );
                    return;
                }
                dispatch(
                    openCanvas({
                        tabId,
                        type: "image",
                        title: filename,
                        url: file.url,
                        alt: filename,
                        fileHash: file.hash,
                        blobPath: file.blobPath || null,
                        filename: filename,
                    }),
                );
            } else {
                if (!file.url) {
                    toast.error(
                        t("Cannot open: file URL not available") ||
                            "Cannot open: file URL not available",
                    );
                    return;
                }
                dispatch(
                    openCanvas({
                        tabId,
                        type: "file",
                        title: filename,
                        filename: filename,
                        mimeType: file.mimeType,
                        url: file.url,
                    }),
                );
            }
        },
        [dispatch, t],
    );

    // Keep ref in sync with the latest handleFileSelect callback
    handleFileSelectRef.current = handleFileSelect;

    const handleNewArticle = useCallback(() => {
        const currentTab = canvasTabs.find((tab) => tab.id === activeTabId);
        const isCurrentTabEmpty =
            currentTab?.content?.type === "empty" ||
            (!currentTab?.content?.type && !currentTab?.content?.fileHash);
        const tabId = isCurrentTabEmpty && activeTabId ? activeTabId : uuidv4();

        const slug = `untitled-${Date.now().toString(36).slice(-6)}`;
        const workspacePath = `/workspace/files/articles/${slug}.html`;

        dispatch(
            openCanvas({
                tabId,
                type: "article",
                fileHash: null,
                filename: `${slug}.html`,
                title: t("Canvas") || "Canvas",
                workspacePath,
                workspaceContentVersion: Date.now(),
            }),
        );
    }, [dispatch, t, activeTabId, canvasTabs]);

    const handleNewTab = useCallback(() => {
        // If no tabs exist but we have content, convert it to a tab first
        if (canvasTabs.length === 0 && canvasContent) {
            dispatch(
                addCanvasTab({
                    ...canvasContent,
                    title:
                        canvasContent.title ||
                        canvasContent.filename ||
                        t("Canvas") ||
                        "Canvas",
                }),
            );
        }
        // Then add the new empty tab
        dispatch(
            addCanvasTab({
                type: "empty",
                title: t("Canvas") || "Canvas",
            }),
        );
    }, [dispatch, t, canvasTabs.length, canvasContent]);

    // Update refs when handlers change
    useEffect(() => {
        handleNewTabRef.current = handleNewTab;
    }, [handleNewTab]);

    useEffect(() => {
        handleNewArticleRef.current = handleNewArticle;
    }, [handleNewArticle]);

    const handleOpenCreateAppletDialog = useCallback(() => {
        setShowCreateAppletDialog(true);
    }, []);

    const handleCreateApplet = useCallback(
        async (prompt) => {
            if (!user?.contextId) {
                toast.error(
                    t("Unable to create file: User context not available") ||
                        "Unable to create file: User context not available",
                );
                return;
            }

            const targetTabId =
                activeTabId && displayContent?.type === "empty"
                    ? activeTabId
                    : uuidv4();

            const { completion } = launchAppletGeneration({
                prompt,
                dispatch,
                userContextId: user.contextId,
                tabId: targetTabId,
                reloadFiles,
                onSuccess: (result) => {
                    if (!result?.saved) {
                        return;
                    }

                    toast.success(
                        t("Applet created successfully") ||
                            "Applet created successfully",
                    );
                },
                onError: (error) => {
                    console.error("Error generating applet:", error);
                    toast.error(
                        error.message ||
                            t("Failed to generate applet. Please try again.") ||
                            "Failed to generate applet. Please try again.",
                    );
                },
                onSaveError: (error) => {
                    console.error("Error saving generated applet:", error);
                    toast.error(
                        t(
                            "Applet generated, but saving failed. Please try again.",
                        ) ||
                            "Applet generated, but saving failed. Please try again.",
                    );
                },
                onSettled: () => {
                    setIsGeneratingApplet(false);
                },
            });

            setIsGeneratingApplet(true);
            void completion.catch(() => {});
        },
        [
            user?.contextId,
            activeTabId,
            displayContent?.type,
            dispatch,
            reloadFiles,
            t,
        ],
    );

    handleCreateAppletRef.current = handleOpenCreateAppletDialog;

    // Common function to add image to file collection and open in canvas
    const addImageToCollection = useCallback(
        async (imageUrl, hash, displayFilename, mimeType = "image/png") => {
            let fileHash = hash;

            if (!user?.contextId) {
                console.warn(
                    "Unable to add image to collection: User context not available",
                );
                return null;
            }

            // If hash not provided, try to find it from media items
            if (!fileHash) {
                try {
                    const { data } = await axios.get(
                        `/api/media-items?page=1&limit=100`,
                    );

                    const mediaItem = data?.mediaItems?.find(
                        (item) =>
                            item.azureUrl === imageUrl ||
                            item.url === imageUrl ||
                            item.gcsUrl === imageUrl,
                    );

                    fileHash = mediaItem?.hash;
                } catch (error) {
                    console.error(
                        "[Canvas] Error querying media items:",
                        error,
                    );
                }
            }

            if (fileHash) {
                // File is already in cloud storage (uploaded by CFH), just reload listing
                await reloadFiles();
                return fileHash;
            } else {
                console.warn(
                    "Image has no hash - cannot add to file collection:",
                    { imageUrl },
                );
                return null;
            }
        },
        [reloadFiles, user?.contextId],
    );

    const handleImageModified = useCallback(
        async (imageUrl, hash = null) => {
            // Close dialog
            setShowModifyImageDialog(false);

            // Create filename for modified image
            const timestamp = new Date()
                .toISOString()
                .replace(/[:.]/g, "-")
                .slice(0, -5);
            const baseFilename = t("Modified Image") || "Modified Image";
            const displayFilename = `${baseFilename} ${timestamp}.png`;

            // Modified images need to be "uploaded" through the media helper
            // to create a Redis entry in CFH, even though they're already in storage
            const imageContextId = user?.contextId;
            let finalUrl = imageUrl;
            let finalHash = hash;
            let finalBlobPath = null;

            if (imageContextId) {
                try {
                    // Fetch the image through proxy to avoid CORS issues
                    const proxyUrl = getDownloadUrl(imageUrl);
                    const response = await fetch(proxyUrl);
                    if (!response.ok) {
                        throw new Error(
                            `Image proxy failed: ${response.statusText}`,
                        );
                    }
                    const blob = await response.blob();
                    const file = new File([blob], displayFilename, {
                        type: "image/png",
                    });

                    const uploadResult = await uploadFileToMediaHelper(file, {
                        storageTarget: createChatStorageTarget(
                            imageContextId,
                            activeChatId,
                        ),
                        checkHash: false,
                    });

                    if (uploadResult?.url && uploadResult?.hash) {
                        finalUrl = uploadResult.url;
                        finalHash = uploadResult.hash;
                        finalBlobPath = uploadResult.blobPath || null;
                    }
                } catch (error) {
                    console.error(
                        "[Canvas] Error uploading modified image:",
                        error,
                    );
                    // Fall back to original URL/hash
                }
            }

            // Add to collection using common function
            const fileHash = await addImageToCollection(
                finalUrl,
                finalHash,
                displayFilename,
                "image/png",
            );

            // Update current canvas tab with the modified image
            const currentContent = displayContent || canvasContent;
            const tabId =
                activeTabId ||
                (currentContent?.id ? currentContent.id : uuidv4());

            // Update the canvas tab with the new image URL and fileHash
            dispatch(
                updateCanvasTab({
                    tabId,
                    content: {
                        ...currentContent,
                        url: finalUrl, // Use the CFH URL, not the original Cortex URL
                        type: "image",
                        fileHash: fileHash, // Include fileHash for file collection reference
                        blobPath: finalBlobPath,
                    },
                }),
            );

            // Reset image transforms for the new image
            const tabKey = tabId;
            setImageTransforms((prev) => ({
                ...prev,
                [tabKey]: {
                    rotation: 0,
                    scaleX: 1,
                    scaleY: 1,
                    brightness: 100,
                    contrast: 100,
                    saturation: 100,
                },
            }));
        },
        [
            dispatch,
            activeTabId,
            activeChatId,
            displayContent,
            canvasContent,
            addImageToCollection,
            user?.contextId,
            t,
        ],
    );

    // Update ref synchronously when handleImageModified is (re)created
    handleImageModifiedRef.current = handleImageModified;

    const handleCloseTab = useCallback(
        (tabId, e) => {
            e?.stopPropagation();
            dispatch(closeCanvasTab(tabId));
        },
        [dispatch],
    );

    const handleSwitchTab = useCallback(
        (tabId) => {
            dispatch(switchCanvasTab(tabId));
        },
        [dispatch],
    );

    // Handle image download (download transformed image)
    // Used via handleImageDownloadRef to avoid no-use-before-define errors.
    const handleImageDownload = useCallback(async () => {
        const content = displayContent || canvasContent;
        if (!content?.url) return;

        try {
            const img = new Image();
            let imageUrlToRevoke = null;

            // Use image-proxy API route to avoid CORS issues
            try {
                const proxyUrl = getDownloadUrl(content.url);
                const response = await fetch(proxyUrl);
                if (!response.ok) {
                    throw new Error(
                        `Image proxy failed: ${response.statusText}`,
                    );
                }
                const blob = await response.blob();
                imageUrlToRevoke = URL.createObjectURL(blob);
                img.src = imageUrlToRevoke;
            } catch (proxyError) {
                // Fallback to direct image loading (may fail with CORS)
                console.warn(
                    "Image proxy failed, trying direct image load:",
                    proxyError,
                );
                img.crossOrigin = "anonymous";
                img.src = content.url;
            }

            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            canvas.width = img.width;
            canvas.height = img.height;

            // Apply transformations
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate((imageTransform.rotation * Math.PI) / 180);
            ctx.scale(imageTransform.scaleX, imageTransform.scaleY);
            ctx.translate(-canvas.width / 2, -canvas.height / 2);

            // Apply filters
            ctx.filter = `brightness(${imageTransform.brightness}%) contrast(${imageTransform.contrast}%) saturate(${imageTransform.saturation}%)`;

            ctx.drawImage(img, 0, 0);

            // Clean up blob URL if we created one
            if (imageUrlToRevoke) {
                URL.revokeObjectURL(imageUrlToRevoke);
            }

            // Download
            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = content?.filename || content?.title || "image.png";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                toast.success(t("Image downloaded") || "Image downloaded");
            });
        } catch (error) {
            console.error("Error downloading image:", error);
            toast.error(
                t("Failed to download image") || "Failed to download image",
            );
        }
    }, [displayContent, canvasContent, imageTransform, t]);

    // Update ref when handleImageDownload changes
    useEffect(() => {
        handleImageDownloadRef.current = handleImageDownload;
    }, [handleImageDownload]);

    // Handle discard confirmation
    // TODO: Discard is now handled in ArticleTabContent
    const handleDiscardConfirm = useCallback(() => {
        setShowDiscardDialog(false);
        toast.info(t("Article operations are handled per-tab"));
    }, [t]);

    // Handle delete button click
    const handleDeleteClick = useCallback(() => {
        const content = displayContent || canvasContent;
        const isImage = content?.type === "image";
        const fileHash = isImage ? content?.fileHash : currentFileHash;
        const blobPath = content?.blobPath;

        if (!fileHash && !blobPath) {
            const message = isImage
                ? t("No image to delete") || "No image to delete"
                : t("No article to delete") || "No article to delete";
            toast.info(message);
            return;
        }
        setShowDeleteDialog(true);
    }, [currentFileHash, displayContent, canvasContent, t]);

    // Update ref when handleDeleteClick changes
    useEffect(() => {
        handleDeleteClickRef.current = handleDeleteClick;
    }, [handleDeleteClick]);

    // Handle delete confirmation
    const handleDeleteConfirm = useCallback(async () => {
        const content = displayContent || canvasContent;
        const isImage = content?.type === "image";

        setShowDeleteDialog(false);

        if (isImage) {
            // Handle image deletion
            const fileHash = content?.fileHash;
            const blobPath = content?.blobPath;
            if (!fileHash && !blobPath) {
                toast.error(t("Image file not found"));
                return;
            }

            setIsDeleting(true);

            try {
                // Delete image from cloud storage
                await deleteFileFromCloud({
                    hash: fileHash,
                    blobPath,
                    contextId: baseContextId,
                });

                // Close only the active tab if available; otherwise close the entire canvas
                if (activeTabId) {
                    dispatch(closeCanvasTab(activeTabId));
                } else {
                    dispatch(closeCanvas());
                }

                // Reload files
                await reloadFiles();
            } catch (error) {
                console.error("Error deleting image:", error);
                toast.error(t("Failed to delete image"));
            } finally {
                setIsDeleting(false);
            }
        } else {
            // Handle article deletion
            const fileHash = currentFileHash || content?.fileHash;
            const blobPath = content?.blobPath;
            if (!fileHash && !blobPath) {
                toast.error(
                    t("No article to delete") || "No article to delete",
                );
                return;
            }

            setIsDeleting(true);

            try {
                // Try to use the active editor if available
                const editor = activeArticleEditorRef.current;
                if (editor && editor.deleteFile) {
                    // Call deleteFile from the active editor
                    // deleteFile expects a file object with a hash property
                    await editor.deleteFile({ hash: fileHash });

                    // After successful deletion, close the tab
                    // The editor will handle showing success/error toast
                    if (activeTabId) {
                        dispatch(closeCanvasTab(activeTabId));
                    }
                } else {
                    // Editor not available - delete directly from cloud
                    await deleteFileFromCloud({
                        hash: fileHash,
                        blobPath,
                        contextId: baseContextId,
                    });

                    // Close the tab if it's open
                    if (activeTabId) {
                        dispatch(closeCanvasTab(activeTabId));
                    }

                    // Reload files
                    await reloadFiles();

                    toast.success(t("File deleted successfully"));
                }
            } catch (error) {
                console.error("Error deleting article:", error);
                toast.error(
                    error.message ||
                        t("Failed to delete file. Please try again.") ||
                        "Failed to delete file. Please try again.",
                );
            } finally {
                setIsDeleting(false);
            }
        }
    }, [
        displayContent,
        canvasContent,
        currentFileHash,
        activeTabId,
        baseContextId,
        reloadFiles,
        dispatch,
        t,
    ]);

    // Handle rename button click
    const handleRenameClick = useCallback(() => {
        const content = displayContent || canvasContent;
        if (!currentFileHash && !content?.blobPath) return;

        // Get current filename (with extension)
        const currentName =
            currentFilename ||
            content?.filename ||
            content?.title ||
            t("Untitled") ||
            "Untitled";
        // Remove extension for input (user can add it back)
        const nameWithoutExt = currentName.replace(/\.[a-zA-Z0-9]+$/, "");
        setRenameValue(nameWithoutExt);
        setShowRenameDialog(true);
    }, [currentFileHash, currentFilename, displayContent, canvasContent, t]);

    // Update ref when handleRenameClick changes
    useEffect(() => {
        handleRenameClickRef.current = handleRenameClick;
    }, [handleRenameClick]);

    // Handle rename submit
    const handleRenameSubmit = useCallback(async () => {
        const content = displayContent || canvasContent;
        const blobPath = content?.blobPath;
        if (
            (!currentFileHash && !blobPath) ||
            !renameValue.trim() ||
            isRenaming
        )
            return;

        setIsRenaming(true);

        try {
            const isImage = content?.type === "image";

            // Determine new filename with appropriate extension
            let newFilename = renameValue.trim();
            if (isImage) {
                // For images, preserve extension if provided, otherwise use .png
                if (!newFilename.match(/\.[a-zA-Z0-9]+$/)) {
                    // Try to get extension from current filename or default to .png
                    const currentExt =
                        currentFilename?.match(/\.[a-zA-Z0-9]+$/)?.at(0) ||
                        ".png";
                    newFilename = `${newFilename}${currentExt}`;
                }
            } else {
                // For articles, add .html if not present
                if (!newFilename.endsWith(".html")) {
                    newFilename = `${newFilename}.html`;
                }
            }

            // Rename file via API
            const renameResponse = await fetch("/api/files/rename", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    hash: currentFileHash,
                    blobPath: blobPath || undefined,
                    newFilename,
                    contextId: baseContextId,
                }),
            });
            if (!renameResponse.ok) {
                const errorData = await renameResponse.json().catch(() => ({}));
                throw new Error(errorData.error || "Failed to rename file");
            }

            // Filename is managed by articleEditor hook for articles, but we need to update canvas for images
            if (isImage || canvasContent) {
                dispatch(
                    openCanvas({
                        ...(canvasContent || content),
                        filename: newFilename,
                        title: newFilename,
                    }),
                );
            }

            // Reload file collection to reflect the change
            await reloadFiles();
            await reloadFiles();

            // Close dialog
            setShowRenameDialog(false);
            setRenameValue("");

            toast.success(
                t("File renamed successfully") || "File renamed successfully",
            );
        } catch (error) {
            console.error("Error renaming file:", error);
            toast.error(
                error.message ||
                    t("Failed to rename file. Please try again.") ||
                    "Failed to rename file. Please try again.",
            );
        } finally {
            setIsRenaming(false);
        }
    }, [
        currentFileHash,
        renameValue,
        isRenaming,
        baseContextId,
        displayContent,
        canvasContent,
        currentFilename,
        dispatch,
        reloadFiles,
        t,
    ]);

    const handleResizeStart = useCallback(
        (e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsResizing(true);
            const currentWidth = canvasWidth !== null ? canvasWidth : 50; // Default to 50% if not set
            resizeRef.current = {
                startX: e.clientX,
                startWidth: currentWidth,
            };
        },
        [canvasWidth],
    );

    const handleResizeMove = useCallback(
        (e) => {
            if (!isResizing || !resizeRef.current) return;

            // Calculate delta (dragging left decreases width, dragging right increases width)
            const deltaX = resizeRef.current.startX - e.clientX;

            // Convert pixel delta to percentage based on viewport width
            const viewportWidth = window.innerWidth;
            const deltaPercent = (deltaX / viewportWidth) * 100;

            // Calculate new width as percentage
            const newWidthPercent = Math.max(
                MIN_WIDTH_PERCENT,
                Math.min(
                    MAX_WIDTH_PERCENT,
                    resizeRef.current.startWidth + deltaPercent,
                ),
            );

            dispatch(setCanvasWidth(newWidthPercent));
        },
        [isResizing, dispatch],
    );

    const handleResizeEnd = useCallback(() => {
        setIsResizing(false);
        resizeRef.current = null;
    }, []);

    // Initialize tabs from existing canvasContent if tabs are empty but content exists
    useEffect(() => {
        if (canvasContent && canvasTabs.length === 0 && !activeTabId) {
            // Create a tab from existing content
            dispatch(
                addCanvasTab({
                    ...canvasContent,
                    title:
                        canvasContent.title ||
                        canvasContent.filename ||
                        t("Canvas") ||
                        "Canvas",
                }),
            );
        }
    }, [canvasContent, canvasTabs.length, activeTabId, dispatch, t]);

    // FileHash changes are handled by the hook

    // Reset image transforms when image changes in active tab
    useEffect(() => {
        const currentContent = displayContent || canvasContent;
        if (currentContent?.type === "image") {
            const tabKey = activeTabId || "default";
            const resetTransform = { ...defaultTransform };
            setImageTransforms((prev) => ({
                ...prev,
                [tabKey]: resetTransform,
            }));
        }
    }, [
        displayContent,
        canvasContent,
        displayContent?.url,
        displayContent?.type,
        canvasContent?.url,
        canvasContent?.type,
        activeTabId,
        defaultTransform,
    ]);

    useEffect(() => {
        if (isResizing) {
            document.addEventListener("mousemove", handleResizeMove);
            document.addEventListener("mouseup", handleResizeEnd);
            document.body.style.cursor = "ew-resize";
            document.body.style.userSelect = "none";

            return () => {
                document.removeEventListener("mousemove", handleResizeMove);
                document.removeEventListener("mouseup", handleResizeEnd);
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
            };
        }
    }, [isResizing, handleResizeMove, handleResizeEnd]);

    // Callback when tab content changes - update Redux with minimal metadata
    const handleTabUpdate = useCallback(
        (tabId, content) => {
            dispatch(updateCanvasTab({ tabId, content }));
        },
        [dispatch],
    );

    // Callback when active article tab editor is ready (exposes operations for header buttons)
    // Use ref comparison to prevent unnecessary state updates and infinite loops
    const handleEditorReady = useCallback((editorState) => {
        // If editorState is null (tab became inactive), always update
        if (!editorState) {
            activeArticleEditorRef.current = null;
            setActiveArticleEditor(null);
            return;
        }

        // Only update if state values actually changed (ignore function reference changes)
        const current = activeArticleEditorRef.current;
        const stateChanged =
            !current ||
            current.hasChanges !== editorState.hasChanges ||
            current.isSaving !== editorState.isSaving ||
            current.isNewStory !== editorState.isNewStory ||
            current.canSave !== editorState.canSave ||
            current.canRevert !== editorState.canRevert;

        if (stateChanged) {
            // Store functions in ref to avoid recreating state object
            const newEditorState = {
                hasChanges: editorState.hasChanges,
                isSaving: editorState.isSaving,
                isNewStory: editorState.isNewStory,
                canSave:
                    editorState.canSave ??
                    (editorState.hasChanges && !editorState.isSaving),
                canRevert:
                    editorState.canRevert ??
                    (editorState.hasChanges && !editorState.isSaving),
                saveFile: editorState.saveFile,
                revertChanges: editorState.revertChanges,
                deleteFile: editorState.deleteFile,
            };
            activeArticleEditorRef.current = newEditorState;
            setActiveArticleEditor(newEditorState);
        }
    }, []);

    // Clear editor state when switching away from article tabs
    useEffect(() => {
        const activeTab = canvasTabs.find((tab) => tab.id === activeTabId);
        const contentType =
            activeTab?.content?.type ||
            displayContent?.type ||
            canvasContent?.type;
        if (contentType !== "article" && contentType !== "story") {
            activeArticleEditorRef.current = null;
            setActiveArticleEditor(null);
        }
    }, [
        activeTabId,
        canvasTabs,
        displayContent,
        canvasContent,
        activeArticleEditor,
    ]);

    const handleRevertActive = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        const editor = activeArticleEditorRef.current;
        if (editor?.revertChanges && editor?.canRevert) {
            editor.revertChanges();
        }
    }, []);

    const handleSaveActive = useCallback(
        async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const editor = activeArticleEditorRef.current;
            if (!editor?.saveFile || editor.isSaving || !editor.canSave) {
                return;
            }

            try {
                const result = await Promise.race([
                    editor.saveFile(),
                    new Promise((_, reject) =>
                        setTimeout(
                            () => reject(new Error("Save timeout after 30s")),
                            30000,
                        ),
                    ),
                ]);

                if (result?.fileHash && activeTabId) {
                    const currentTab = canvasTabs.find(
                        (tab) => tab.id === activeTabId,
                    );
                    if (currentTab) {
                        dispatch(
                            updateCanvasTab({
                                tabId: activeTabId,
                                content: {
                                    ...currentTab.content,
                                    fileHash: result.fileHash,
                                    filename:
                                        result.filename ||
                                        currentTab.content?.filename,
                                },
                            }),
                        );
                    }
                }

                dispatch(incrementFileBrowserRefresh());

                await new Promise((resolve) => setTimeout(resolve, 100));
                setShowCheckmark(true);
                setTimeout(() => setShowCheckmark(false), 2000);
            } catch (error) {
                console.error("[Canvas] Error saving:", error);
            }
        },
        [activeTabId, canvasTabs, dispatch],
    );

    // Early returns after all hooks
    // Show canvas if it's visible, even if there's no content (allows empty tabs)
    if (!canvasVisible && canvasTabs.length === 0 && !canvasContent) {
        return null;
    }

    const generateAppletDialog = (
        <GenerateHtmlDialog
            show={showCreateAppletDialog}
            onHide={() => setShowCreateAppletDialog(false)}
            onGenerate={handleCreateApplet}
        />
    );

    const contentType = displayContent?.type;
    const isArticleType = contentType === "story" || contentType === "article";
    const isCanvasChromeHidden =
        contentType === "html" &&
        displayContent?.canvasChrome === "hidden" &&
        !displayContent?.appletId;

    return (
        <div
            className={`flex flex-col h-full ${isCanvasChromeHidden ? "border-0 bg-white dark:bg-gray-800 p-0" : isMobile ? "border-0 bg-white dark:bg-gray-800" : "border-s border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4"} relative`}
        >
            {!isMobile && (
                <div
                    className="absolute top-0 bottom-0 start-0 w-1 cursor-ew-resize hover:bg-sky-500 dark:hover:bg-sky-400 z-20 transition-colors"
                    onMouseDown={handleResizeStart}
                    style={{ cursor: "ew-resize" }}
                />
            )}
            <div
                className={`flex flex-col h-full ${isCanvasChromeHidden ? "bg-white dark:bg-gray-800" : isMobile ? "bg-white dark:bg-gray-800" : "bg-white dark:bg-gray-800 rounded-lg shadow-lg"} overflow-hidden`}
            >
                {/* Tab bar with right-aligned contextual actions. This is the
                    only chrome — titles live in the tabs themselves, and the
                    file browser is only reachable via "+" -> EmptyTabContent. */}
                {canvasVisible && !isCanvasChromeHidden && (
                    <div className="flex items-center border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-2">
                        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
                            {canvasTabs.map((tab) => {
                                const isActive = tab.id === activeTabId;
                                return (
                                    <div
                                        key={tab.id}
                                        onClick={() => handleSwitchTab(tab.id)}
                                        className={`group flex items-center gap-2 px-3 py-2 rounded-t-lg cursor-pointer transition-colors ${
                                            isActive
                                                ? "bg-white dark:bg-gray-800 border-t border-s border-e border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50"
                                        }`}
                                    >
                                        <span
                                            className="text-sm font-medium truncate max-w-[200px]"
                                            title={getCanvasTabDisplayTitle(
                                                tab,
                                            )}
                                        >
                                            {getCanvasTabDisplayTitle(tab)}
                                        </span>
                                        <button
                                            onClick={(e) =>
                                                handleCloseTab(tab.id, e)
                                            }
                                            className={`ms-1 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-opacity ${
                                                isActive
                                                    ? "opacity-70"
                                                    : "opacity-0 group-hover:opacity-70"
                                            }`}
                                            title={
                                                t("Close tab") || "Close tab"
                                            }
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                );
                            })}
                            <button
                                onClick={handleNewTab}
                                className="ms-1 p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                                title={t("New tab") || "New tab"}
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex items-center gap-2 ps-2 flex-shrink-0">
                            {isArticleType && activeArticleEditor && (
                                <>
                                    {activeArticleEditor.hasChanges && (
                                        <Button
                                            onClick={handleRevertActive}
                                            disabled={
                                                !activeArticleEditor.canRevert
                                            }
                                            variant="outline"
                                            size="sm"
                                            className="flex items-center gap-2 h-8 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                            {activeArticleEditor.isNewStory
                                                ? t("Discard") || "Discard"
                                                : t("Revert") || "Revert"}
                                        </Button>
                                    )}
                                    <Button
                                        onClick={handleSaveActive}
                                        disabled={!activeArticleEditor.canSave}
                                        variant={
                                            activeArticleEditor.hasChanges
                                                ? "default"
                                                : "ghost"
                                        }
                                        size="sm"
                                        className={`flex items-center gap-2 h-8 ${
                                            activeArticleEditor.hasChanges
                                                ? "bg-sky-600 hover:bg-sky-700 text-white dark:bg-sky-500 dark:hover:bg-sky-600"
                                                : ""
                                        }`}
                                    >
                                        {activeArticleEditor.isSaving ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                {t("Saving...") || "Saving..."}
                                            </>
                                        ) : showCheckmark ? (
                                            <>
                                                <Check className="w-4 h-4" />
                                                {t("Saved") || "Saved"}
                                            </>
                                        ) : (
                                            <>
                                                <Save className="w-4 h-4" />
                                                {t("Save") || "Save"}
                                            </>
                                        )}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Content area is just TabManager — no header, no sidebar.
                    The file browser lives inside EmptyTabContent (the "+" tab). */}
                <div className="flex-1 min-h-0 overflow-hidden">
                    {canvasTabs.length > 0 ? (
                        <TabManager
                            tabs={canvasTabs}
                            activeTabId={activeTabId}
                            onTabUpdate={handleTabUpdate}
                            onEditorReady={handleEditorReady}
                            onFileSelect={onFileSelectFromBrowser}
                            onNewArticle={onNewArticleClick}
                            onCreateApplet={onCreateAppletClick}
                            isGeneratingApplet={isGeneratingApplet}
                            chatTitleMap={chatTitleMap}
                            refreshKey={fileBrowserRefreshKey}
                            isMobile={isMobile}
                            onCloseCanvas={() => {
                                dispatch(closeCanvas());
                                dispatch(setCanvasVisibility(false));
                            }}
                        />
                    ) : (
                        <div className="h-full flex items-center justify-center p-6 text-sm text-gray-500 dark:text-gray-400">
                            {t("Click + to start") || "Click + to start"}
                        </div>
                    )}
                </div>
            </div>

            {/* Delete Dialog */}
            <AlertDialog
                open={showDeleteDialog}
                onOpenChange={setShowDeleteDialog}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("Delete Article?") || "Delete Article?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to delete '{{title}}'? This action cannot be undone.",
                                {
                                    title:
                                        displayContent?.headline ||
                                        currentFilename ||
                                        t("Untitled"),
                                },
                            ) ||
                                `Are you sure you want to delete '${displayContent?.headline || currentFilename || "Untitled"}'? This action cannot be undone.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            onClick={() => setShowDeleteDialog(false)}
                        >
                            {t("Cancel") || "Cancel"}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {t("Delete") || "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Discard Dialog - for new stories */}
            <AlertDialog
                open={showDiscardDialog}
                onOpenChange={setShowDiscardDialog}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("Discard Changes?") || "Discard Changes?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to discard all changes? This will clear the current story and cannot be undone.",
                            ) ||
                                "Are you sure you want to discard all changes? This will clear the current story and cannot be undone."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            onClick={() => setShowDiscardDialog(false)}
                        >
                            {t("Cancel") || "Cancel"}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDiscardConfirm}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {t("Discard") || "Discard"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Rename Dialog */}
            <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {t("Rename File") || "Rename File"}
                        </DialogTitle>
                        <DialogDescription>
                            {t("Enter a new name for this file") ||
                                "Enter a new name for this file"}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="rename-input">
                                {t("File Name") || "File Name"}
                            </Label>
                            <Input
                                id="rename-input"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (
                                        e.key === "Enter" &&
                                        !isRenaming &&
                                        renameValue.trim()
                                    ) {
                                        handleRenameSubmit();
                                    }
                                    if (e.key === "Escape") {
                                        setShowRenameDialog(false);
                                    }
                                }}
                                placeholder={
                                    t("Enter file name") || "Enter file name"
                                }
                                disabled={isRenaming}
                                autoFocus
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowRenameDialog(false);
                                setRenameValue("");
                            }}
                            disabled={isRenaming}
                        >
                            {t("Cancel") || "Cancel"}
                        </Button>
                        <Button
                            onClick={handleRenameSubmit}
                            disabled={isRenaming || !renameValue.trim()}
                        >
                            {isRenaming ? (
                                <>
                                    <Loader2 className="w-4 h-4 me-2 animate-spin" />
                                    {t("Renaming...") || "Renaming..."}
                                </>
                            ) : (
                                t("Rename") || "Rename"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {generateAppletDialog}
        </div>
    );
}
