"use client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OutputSandbox from "@/src/components/sandbox/OutputSandbox";
import { ThemeContext } from "@/src/contexts/ThemeProvider";
import FileManager from "@/src/components/common/FileManager";
import MonacoEditor from "@monaco-editor/react";
import { useParams } from "next/navigation";
import { useContext, useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";

// Function to convert unpkg.com Lucide icon URLs to local routes
const convertLucideIconsToLocalRoutes = async (htmlContent) => {
    // Create a temporary DOM element to parse the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");

    let hasChanges = false;
    const lucideIconPattern =
        /^https:\/\/unpkg\.com\/lucide-static@latest\/icons\/([^.]+)\.svg$/;

    // Find all img tags
    const images = doc.querySelectorAll("img");

    if (images.length === 0) {
        return { html: htmlContent, hasChanges: false };
    }

    // Process each image
    images.forEach((img, index) => {
        const src = img.getAttribute("src");

        if (!src) {
            return;
        }

        const match = src.match(lucideIconPattern);
        if (!match) {
            return;
        }

        const spinalCaseIconName = match[1];

        // Replace unpkg.com URLs with local route
        // The API will handle closest matches automatically
        const localSrc = `/api/icons/${spinalCaseIconName}`;
        img.setAttribute("src", localSrc);
        hasChanges = true;
    });

    // Return the updated HTML if changes were made
    if (hasChanges) {
        return { html: doc.documentElement.outerHTML, hasChanges: true };
    }

    return { html: htmlContent, hasChanges: false };
};

function HtmlEditor({ value, onChange, options }) {
    return (
        <MonacoEditor
            height="100%"
            width="100%"
            language="html"
            theme="vs-dark"
            options={{
                fontSize: 12,
                fontWeight: "normal",
                ...options,
            }}
            value={value}
            onChange={onChange}
        />
    );
}

// Creating Applet Dialog Component
function CreatingAppletDialog({ isVisible, containerRef: parentContainerRef }) {
    const { t } = useTranslation();
    const [position, setPosition] = useState({
        top: 0,
        left: 0,
        width: 0,
        height: 0,
    });
    useEffect(() => {
        if (!isVisible || !parentContainerRef?.current) return;

        const container = parentContainerRef.current;
        // Track scrollable elements in a Set that's captured in the closure
        const scrollableElements = new Set();

        const updatePosition = () => {
            const rect = container.getBoundingClientRect();
            setPosition({
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
            });
        };

        // Find all scrollable elements within the container (including nested ones)
        const findScrollableElements = (element) => {
            const scrollables = new Set();

            const checkElement = (el) => {
                if (!el || !el.classList) return;

                const style = window.getComputedStyle(el);
                const hasScroll =
                    style.overflow === "auto" ||
                    style.overflow === "scroll" ||
                    style.overflowY === "auto" ||
                    style.overflowY === "scroll" ||
                    style.overflowX === "auto" ||
                    style.overflowX === "scroll";

                if (
                    hasScroll &&
                    (el.scrollHeight > el.clientHeight ||
                        el.scrollWidth > el.clientWidth)
                ) {
                    scrollables.add(el);
                }

                // Check children recursively
                Array.from(el.children).forEach((child) => checkElement(child));
            };

            checkElement(element);
            return scrollables;
        };

        const setupScrollListeners = () => {
            // Clear previous listeners
            scrollableElements.forEach((el) => {
                el.removeEventListener("scroll", updatePosition);
            });
            scrollableElements.clear();

            // Find and listen to all scrollable elements
            const scrollables = findScrollableElements(container);
            scrollables.forEach((el) => {
                el.addEventListener("scroll", updatePosition, {
                    passive: true,
                });
                scrollableElements.add(el);
            });

            // Also listen to the container itself
            container.addEventListener("scroll", updatePosition, {
                passive: true,
            });
            scrollableElements.add(container);
        };

        updatePosition();
        setupScrollListeners();

        // Use MutationObserver to detect when scrollable elements are added/removed
        const observer = new MutationObserver(() => {
            setupScrollListeners();
            updatePosition();
        });

        observer.observe(container, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "style"],
        });

        window.addEventListener("scroll", updatePosition, true);
        window.addEventListener("resize", updatePosition);

        return () => {
            // Use the captured scrollableElements Set from closure
            scrollableElements.forEach((el) => {
                el.removeEventListener("scroll", updatePosition);
            });
            scrollableElements.clear();
            observer.disconnect();
            window.removeEventListener("scroll", updatePosition, true);
            window.removeEventListener("resize", updatePosition);
        };
    }, [isVisible, parentContainerRef]);

    if (!isVisible) return null;

    return (
        <div
            className="fixed bg-white/5 dark:bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 pointer-events-none"
            style={{
                top: `${position.top}px`,
                left: `${position.left}px`,
                width: `${position.width}px`,
                height: `${position.height}px`,
            }}
        >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg dark:shadow-gray-900/50 p-6 max-w-sm mx-4 pointer-events-auto border dark:border-gray-700">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-5 h-5 border-2 border-r-emerald-600 dark:border-r-emerald-500 border-b-emerald-600 dark:border-b-emerald-500 border-l-emerald-600 dark:border-l-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {t("Creating Applet...")}
                    </h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    {t(
                        "The AI is generating your applet. The preview will update in real-time as the code is being written.",
                    )}
                </p>
            </div>
        </div>
    );
}

// Empty state placeholder component
function EmptyStatePlaceholder() {
    const { t } = useTranslation();

    return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                <svg
                    className="w-8 h-8 text-gray-400 dark:text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {t("No applet created yet")}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 max-w-md">
                {t(
                    "Use the chat interface to describe your desired UI, or paste HTML code directly in the Code tab to create your first version.",
                )}
            </p>
        </div>
    );
}

// Loading state component
function LoadingStatePlaceholder() {
    const { t } = useTranslation();

    return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-sky-600 rounded-full animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {t("Loading applet...")}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 max-w-md">
                {t("Please wait while we load your applet data.")}
            </p>
        </div>
    );
}

// Streaming preview component that throttles updates for better performance
// Uses OutputSandbox (iframe) for proper isolation and security
function StreamingPreview({ content, theme }) {
    const [displayContent, setDisplayContent] = useState(content);
    const updateTimeoutRef = useRef(null);
    const lastUpdateRef = useRef(Date.now());

    // Throttle updates to avoid re-rendering on every character
    // Update immediately if it's been more than 1000ms, otherwise debounce
    useEffect(() => {
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdateRef.current;
        const THROTTLE_MS = 1000; // Update at most every 1000ms during streaming

        if (timeSinceLastUpdate >= THROTTLE_MS) {
            // Enough time has passed, update immediately
            setDisplayContent(content);
            lastUpdateRef.current = now;
        } else {
            // Too soon, schedule an update
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
            }

            updateTimeoutRef.current = setTimeout(() => {
                setDisplayContent(content);
                lastUpdateRef.current = Date.now();
            }, THROTTLE_MS - timeSinceLastUpdate);
        }

        // Cleanup on unmount
        return () => {
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
            }
        };
    }, [content]);

    // Use OutputSandbox for proper iframe isolation and security
    // This prevents HTML from escaping and affecting the parent page
    return (
        <OutputSandbox content={displayContent} height="100%" theme={theme} />
    );
}

// JSON Editor component for displaying applet data
function JsonEditor({ value, onChange, options }) {
    return (
        <MonacoEditor
            height="100%"
            width="100%"
            language="json"
            theme="vs-dark"
            options={{
                fontSize: 12,
                fontWeight: "normal",
                ...options,
            }}
            value={value}
            onChange={onChange}
        />
    );
}

// Files tab component
function FilesTab({ workspaceId, isOwner }) {
    const { t } = useTranslation();
    const [files, setFiles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch files
    const fetchFiles = useCallback(async () => {
        if (!workspaceId) return;
        try {
            setIsLoading(true);
            const response = await fetch(
                `/api/workspaces/${workspaceId}/applet/files`,
            );
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            setFiles(result.files || []);
        } catch (err) {
            console.error("Error fetching applet files:", err);
        } finally {
            setIsLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    // Delete files handler
    const handleDelete = useCallback(
        async (filesToRemove) => {
            if (!isOwner) return;

            // Delete files one by one (API supports single file delete)
            await Promise.all(
                filesToRemove.map(async (file) => {
                    const filename = file.filename || file.originalName;
                    const response = await fetch(
                        `/api/workspaces/${workspaceId}/applet/files?filename=${encodeURIComponent(filename)}`,
                        { method: "DELETE" },
                    );
                    if (!response.ok) {
                        throw new Error(
                            `Delete failed: ${response.statusText}`,
                        );
                    }
                }),
            );
        },
        [workspaceId, isOwner],
    );

    return (
        <div className="h-full flex flex-col">
            <div className="mb-3 p-2 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-md">
                <div className="flex items-center gap-2 text-sky-800 dark:text-sky-300 text-sm">
                    <span className="text-sky-600 dark:text-sky-400">📁</span>
                    <span>
                        {t(
                            "Debug files - Your personal files uploaded while developing this applet",
                        )}
                    </span>
                </div>
            </div>

            <div className="flex-1 overflow-auto">
                <FileManager
                    files={files}
                    isLoading={isLoading}
                    onRefetch={fetchFiles}
                    onDelete={isOwner ? handleDelete : undefined}
                    emptyTitle={t("No debug files uploaded yet")}
                    emptyDescription={t(
                        "No personal files have been uploaded while developing this applet. These files are for debugging purposes only, not for end users.",
                    )}
                    showPermanentColumn={false}
                    showDateColumn={true}
                    enableFilenameEdit={false}
                    enableHoverPreview={true}
                    enableBulkActions={isOwner}
                    enableFilter={true}
                    enableSort={true}
                    optimisticDelete={true}
                    containerHeight="100%"
                />
            </div>
        </div>
    );
}

// Constants
const SAVE_DEBOUNCE_DELAY = 1000; // 1 second debounce for data saving

// Data tab component
function DataTab({ workspaceId, isOwner }) {
    const { t } = useTranslation();
    const [appletData, setAppletData] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const saveTimeoutRef = useRef(null);

    // Fetch applet data
    useEffect(() => {
        const fetchAppletData = async () => {
            try {
                setIsLoading(true);
                setError(null);

                const response = await fetch(
                    `/api/workspaces/${workspaceId}/applet/data`,
                );
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const result = await response.json();
                setAppletData(result.data || {});
            } catch (err) {
                console.error("Error fetching applet data:", err);
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        if (workspaceId) {
            fetchAppletData();
        }
    }, [workspaceId]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    // Handle data updates with debouncing
    const handleDataChange = async (newValue) => {
        try {
            // Parse the JSON to validate it
            const parsedData = JSON.parse(newValue);

            // Update local state immediately
            setAppletData(parsedData);

            // Clear existing timeout
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }

            // Debounce the save operation
            saveTimeoutRef.current = setTimeout(async () => {
                setIsSaving(true);
                try {
                    // Save to server - update each key-value pair
                    for (const [key, value] of Object.entries(parsedData)) {
                        try {
                            const response = await fetch(
                                `/api/workspaces/${workspaceId}/applet/data`,
                                {
                                    method: "PUT",
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({ key, value }),
                                },
                            );

                            if (!response.ok) {
                                console.error(
                                    `Failed to save data for key: ${key}`,
                                );
                            }
                        } catch (err) {
                            console.error(
                                `Error saving data for key ${key}:`,
                                err,
                            );
                        }
                    }
                } finally {
                    setIsSaving(false);
                }
            }, SAVE_DEBOUNCE_DELAY);
        } catch (err) {
            console.error("Invalid JSON:", err);
            // Don't update state if JSON is invalid
        }
    };

    if (isLoading) {
        return <LoadingStatePlaceholder />;
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                    <svg
                        className="w-8 h-8 text-red-400 dark:text-red-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                        />
                    </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    {t("Error loading data")}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 max-w-md">
                    {error}
                </p>
            </div>
        );
    }

    const jsonString = JSON.stringify(appletData, null, 2);
    const hasData = Object.keys(appletData).length > 0;

    return (
        <div className="h-full flex flex-col">
            <div className="mb-3 p-2 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-md">
                <div className="flex items-center justify-between text-sky-800 dark:text-sky-300 text-sm">
                    <div className="flex items-center gap-2">
                        <span className="text-sky-600 dark:text-sky-400">
                            💾
                        </span>
                        <span>
                            {t(
                                "Debug data - Your personal data stored while developing this applet",
                            )}
                        </span>
                    </div>
                    {isSaving && (
                        <div className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
                            <div className="w-3 h-3 border border-sky-600 dark:border-sky-400 border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs">{t("Saving...")}</span>
                        </div>
                    )}
                </div>
            </div>
            <div className="flex-1 overflow-auto">
                {!hasData ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                            <svg
                                className="w-8 h-8 text-gray-400 dark:text-gray-500"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                                />
                            </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                            {t("No debug data stored yet")}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 max-w-md">
                            {t(
                                "No personal data has been stored while developing this applet. This data is for debugging purposes only, not for end users.",
                            )}
                        </p>
                    </div>
                ) : (
                    <JsonEditor
                        value={jsonString}
                        onChange={isOwner ? handleDataChange : undefined}
                        options={{
                            readOnly: !isOwner,
                        }}
                    />
                )}
            </div>
        </div>
    );
}

export default function PreviewTabs({
    htmlVersions,
    activeVersionIndex,
    onHtmlChange,
    isStreaming = false,
    isOwner = true,
    hasStreamingVersion = false,
    showCreatingDialog = false,
    isLoading = false,
    isCurrentVersionPublished = false,
}) {
    const { t } = useTranslation();
    const { theme } = useContext(ThemeContext);
    const [processedContent, setProcessedContent] = useState("");
    const { id: workspaceId } = useParams();
    const scrollableContainerRef = useRef(null);

    const hasVersions = htmlVersions.length > 0;
    const currentContent = hasVersions ? htmlVersions[activeVersionIndex] : "";

    // Process content to convert Lucide icons to local routes when content changes
    useEffect(() => {
        if (!currentContent) {
            setProcessedContent("");
            return;
        }

        const processContent = async () => {
            try {
                const result =
                    await convertLucideIconsToLocalRoutes(currentContent);
                setProcessedContent(result.html);

                // If changes were made and we have an onChange handler, update the HTML
                // Don't trigger updates during streaming - they'll be saved when streaming completes
                if (
                    result.hasChanges &&
                    onHtmlChange &&
                    isOwner &&
                    !isCurrentVersionPublished &&
                    !isStreaming
                ) {
                    onHtmlChange(result.html, activeVersionIndex);
                }
            } catch (error) {
                console.error("Error processing Lucide icons:", error);
                setProcessedContent(currentContent);
                // Optionally, add user feedback here (e.g., toast notification)
            }
        };

        processContent();
    }, [
        currentContent,
        onHtmlChange,
        isOwner,
        isCurrentVersionPublished,
        activeVersionIndex,
        isStreaming,
    ]);

    // Use processed content for display
    const displayContent = processedContent || currentContent;

    return (
        <Tabs
            defaultValue="preview"
            className="flex flex-col grow overflow-auto"
        >
            <TabsList>
                <TabsTrigger value="preview">{t("Preview")}</TabsTrigger>
                <TabsTrigger value="code">{t("Code")}</TabsTrigger>
                <TabsTrigger value="data">{t("Data")}</TabsTrigger>
                <TabsTrigger value="files">{t("Files")}</TabsTrigger>
            </TabsList>

            <CreatingAppletDialog
                isVisible={showCreatingDialog}
                containerRef={scrollableContainerRef}
            />
            <div
                ref={scrollableContainerRef}
                className="border rounded-md shadow-md bg-white dark:bg-gray-800 dark:border-gray-600 flex-1 min-w-0 overflow-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 relative"
            >
                <div className="flex flex-col h-full">
                    <div className="flex-1 p-4">
                        <TabsContent
                            value="preview"
                            className="h-full m-0 min-w-0"
                        >
                            {isLoading ? (
                                <LoadingStatePlaceholder />
                            ) : !hasVersions ? (
                                <EmptyStatePlaceholder />
                            ) : isStreaming && hasStreamingVersion ? (
                                <StreamingPreview
                                    content={displayContent}
                                    theme={theme}
                                />
                            ) : (
                                <OutputSandbox
                                    content={displayContent}
                                    height="100%"
                                    theme={theme}
                                />
                            )}
                        </TabsContent>
                        <TabsContent
                            value="code"
                            className="h-full m-0 min-w-0 overflow-hidden"
                        >
                            {isLoading ? (
                                <LoadingStatePlaceholder />
                            ) : (
                                <div className="h-full flex flex-col">
                                    {isCurrentVersionPublished && (
                                        <div className="mb-3 p-2 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-md">
                                            <div className="flex items-center gap-2 text-sky-800 dark:text-sky-300 text-sm">
                                                <span className="text-sky-600 dark:text-sky-400">
                                                    🔒
                                                </span>
                                                <span>
                                                    {t(
                                                        "This version is published and cannot be edited",
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex-1 overflow-auto">
                                        <HtmlEditor
                                            value={displayContent}
                                            onChange={
                                                isOwner &&
                                                !isCurrentVersionPublished
                                                    ? (value) => {
                                                          onHtmlChange(
                                                              value,
                                                              activeVersionIndex,
                                                          );
                                                      }
                                                    : undefined
                                            }
                                            options={{
                                                readOnly:
                                                    !isOwner ||
                                                    isCurrentVersionPublished,
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </TabsContent>
                        <TabsContent
                            value="data"
                            className="h-full m-0 min-w-0 overflow-hidden"
                        >
                            <DataTab
                                workspaceId={workspaceId}
                                isOwner={isOwner}
                            />
                        </TabsContent>
                        <TabsContent
                            value="files"
                            className="h-full m-0 min-w-0 overflow-hidden"
                        >
                            <FilesTab
                                workspaceId={workspaceId}
                                isOwner={isOwner}
                            />
                        </TabsContent>
                    </div>
                </div>
            </div>
        </Tabs>
    );
}
