import React, {
    useEffect,
    useRef,
    useState,
    forwardRef,
    useCallback,
} from "react";
import { createPortal } from "react-dom";
import { convertMessageToMarkdown } from "../chat/ChatMessage";

const OutputSandbox = forwardRef(
    ({ content, height = "300px", theme = "light" }, ref) => {
        const iframeRef = useRef(null);
        const [isLoading, setIsLoading] = useState(true);
        const resizeObserverRef = useRef(null);
        const mutationObserverRef = useRef(null);
        const [portalContainers, setPortalContainers] = useState(new Map());
        const isInitializedRef = useRef(false);
        const lastHeadContentRef = useRef("");
        const lastThemeRef = useRef(theme);

        // Forward the ref to the iframe
        React.useImperativeHandle(ref, () => ({
            get iframe() {
                return iframeRef.current;
            },
        }));

        // Function to clean up old portal containers
        const cleanupOldPortals = useCallback((frameDoc) => {
            setPortalContainers((prev) => {
                const newMap = new Map();
                prev.forEach((value, key) => {
                    // Check if the container still exists in the document
                    if (frameDoc.contains(value.container)) {
                        newMap.set(key, value);
                    } else {
                        console.log(
                            "Removing old portal container from state:",
                            key,
                        );
                    }
                });
                return newMap;
            });
        }, []);

        // Function to clear all portal containers (used when iframe is recreated)
        const clearAllPortals = useCallback(() => {
            setPortalContainers(new Map());
        }, []);

        // Function to remove old portal containers from DOM
        const removeOldPortalContainers = useCallback((frameDoc) => {
            const oldContainers = frameDoc.querySelectorAll(
                ".react-portal-container",
            );
            oldContainers.forEach((container) => {
                // Only remove containers that don't have a corresponding processed pre element
                const portalId = container.dataset.portalId;
                const correspondingPre = frameDoc.querySelector(
                    `pre[data-portal-id="${portalId}"]`,
                );

                if (
                    !correspondingPre ||
                    correspondingPre.dataset.processed !== "true"
                ) {
                    if (container.parentNode) {
                        console.log(
                            "Removing orphaned portal container from DOM:",
                            portalId,
                        );
                        container.remove();
                    }
                }
            });
        }, []);

        // Function to process pre elements with JSON content
        const processPreElements = useCallback(
            (frameDoc) => {
                if (!frameDoc || !frameDoc.body) {
                    console.warn("Frame document not accessible");
                    return;
                }

                // Clean up old portal containers from DOM first
                removeOldPortalContainers(frameDoc);

                // Clean up old portal containers from state
                cleanupOldPortals(frameDoc);

                const preElements = frameDoc.querySelectorAll("pre.llm-output");
                if (preElements.length === 0) {
                    console.log(
                        "No pre elements found - skipping portal processing",
                    );
                    return;
                }

                preElements.forEach((preElement, index) => {
                    // Check if this element was already processed
                    const wasProcessed =
                        preElement.dataset.processed === "true";

                    let existingContainer = null; // Declare outside the if block

                    // If it was processed, check if the content has changed
                    if (wasProcessed) {
                        const currentContent = preElement.textContent.trim();
                        const lastProcessedContent =
                            preElement.dataset.lastContent;

                        // If content hasn't changed, skip processing
                        if (currentContent === lastProcessedContent) {
                            console.log(
                                "Skipping already processed element with unchanged content",
                            );
                            return;
                        }

                        // Find the existing portal container but don't remove it yet
                        existingContainer = frameDoc.querySelector(
                            `[data-portal-id="${preElement.dataset.portalId}"]`,
                        );

                        // Clear the processed flag
                        delete preElement.dataset.processed;
                        delete preElement.dataset.portalId;
                        delete preElement.dataset.lastContent;

                        // Verify the pre element is still in the DOM before proceeding
                        if (!preElement.parentNode) {
                            console.warn(
                                "Pre element has no parent, skipping reprocessing",
                            );
                            return;
                        }
                    } else {
                    }

                    try {
                        // Check if element has text content
                        if (
                            !preElement.textContent ||
                            !preElement.textContent.trim()
                        ) {
                            // If it was previously processed but now has no content, clear the flags
                            if (preElement.dataset.processed === "true") {
                                delete preElement.dataset.processed;
                                delete preElement.dataset.portalId;
                                delete preElement.dataset.lastContent;
                            } else {
                            }
                            return;
                        }

                        let textContent = preElement.textContent.trim();
                        // Remove surrounding double quotes if present
                        if (
                            textContent.startsWith('"') &&
                            textContent.endsWith('"') &&
                            textContent.length >= 2
                        ) {
                            textContent = textContent.slice(1, -1);
                        }

                        let jsonData;
                        try {
                            jsonData = JSON.parse(textContent);
                        } catch (error) {
                            console.error(
                                "Failed to parse JSON content:",
                                error,
                            );
                            return;
                        }

                        // Add explicit null/undefined checks
                        if (!jsonData || typeof jsonData !== "object") {
                            console.error("Invalid JSON data structure");
                            return;
                        }

                        const output = jsonData.markdown || jsonData.output;

                        // Check if it has the expected structure with markdown and citations
                        if (
                            output &&
                            jsonData.citations &&
                            Array.isArray(jsonData.citations)
                        ) {
                            // Create a container for the React component
                            const container = frameDoc.createElement("div");
                            container.className = "react-portal-container";
                            const portalId = `portal-${Date.now()}-${Math.random()}`;
                            container.dataset.portalId = portalId;

                            // Insert the container after the pre element instead of replacing it
                            if (!preElement.parentNode) {
                                console.error(
                                    "Pre element has no parent, cannot insert portal container",
                                );
                                return;
                            }
                            preElement.parentNode.insertBefore(
                                container,
                                preElement.nextSibling,
                            );

                            // Mark as processed and store content hash
                            preElement.dataset.processed = "true";
                            preElement.dataset.portalId = portalId;
                            preElement.dataset.lastContent = textContent;

                            // Create a message object for convertMessageToMarkdown
                            const message = {
                                payload: output,
                                tool: JSON.stringify({
                                    citations: jsonData.citations,
                                }),
                            };

                            // Convert to React component
                            const reactComponent = convertMessageToMarkdown(
                                message,
                                true,
                            );

                            // Store the portal container for rendering
                            setPortalContainers((prev) => {
                                const newMap = new Map(prev);
                                newMap.set(portalId, {
                                    container,
                                    component: reactComponent,
                                    frameDoc,
                                });
                                return newMap;
                            });

                            // Don't remove the old container immediately - let the cleanup function handle it
                            // This prevents DOM manipulation issues that could affect the pre element
                            if (existingContainer) {
                                console.log(
                                    "Old portal container will be cleaned up by cleanupOldPortals",
                                );
                            }
                        } else {
                            console.log(
                                "JSON missing required fields:",
                                jsonData,
                            );
                        }
                    } catch (error) {
                        console.warn(
                            "Failed to parse JSON in pre element:",
                            error,
                        );
                    }
                });
            },
            [cleanupOldPortals, removeOldPortalContainers],
        );

        useEffect(() => {
            if (!iframeRef.current) {
                return;
            }

            // Don't process if content is null/empty
            if (!content) {
                return;
            }

            const iframe = iframeRef.current;

            const updateContent = async () => {
                try {
                    // Import the shared utility functions
                    const {
                        generateFilteredSandboxHtml,
                        extractHtmlStructure,
                    } = await import("../../utils/themeUtils");

                    // Extract head and body content to check if head changed
                    const { headContent, bodyContent } =
                        extractHtmlStructure(content);
                    const headContentChanged =
                        headContent !== lastHeadContentRef.current;
                    const themeChanged = theme !== lastThemeRef.current;

                    // IMPORTANT: Only do incremental updates if:
                    // 1. Iframe is fully initialized (onload has fired)
                    // 2. Only body content changed (head/theme unchanged)
                    // 3. Iframe document is accessible
                    // Otherwise, do a full reload (which is needed for first load anyway)
                    const canDoIncrementalUpdate =
                        isInitializedRef.current &&
                        !headContentChanged &&
                        !themeChanged &&
                        iframe.contentDocument &&
                        iframe.contentDocument.body &&
                        iframe.contentDocument.body.parentNode;

                    if (canDoIncrementalUpdate) {
                        try {
                            const frameDoc =
                                iframe.contentDocument ||
                                iframe.contentWindow.document;
                            // Update body content directly without reloading
                            frameDoc.body.innerHTML = bodyContent;

                            // Process any new pre elements that might have been added
                            processPreElements(frameDoc);

                            // Manually update iframe height after content change
                            // ResizeObserver might not fire immediately after innerHTML update
                            // Use a double RAF to ensure layout has settled
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    if (
                                        frameDoc.body &&
                                        frameDoc.documentElement
                                    ) {
                                        // Force a reflow to ensure measurements are accurate
                                        void frameDoc.body.offsetHeight;

                                        // Calculate height based on the actual content
                                        const bodyHeight = Math.max(
                                            frameDoc.body.scrollHeight,
                                            frameDoc.body.offsetHeight,
                                            frameDoc.body.clientHeight,
                                        );
                                        const docHeight = Math.max(
                                            frameDoc.documentElement
                                                .scrollHeight,
                                            frameDoc.documentElement
                                                .offsetHeight,
                                            frameDoc.documentElement
                                                .clientHeight,
                                        );
                                        const height = Math.max(
                                            bodyHeight,
                                            docHeight,
                                            100,
                                        ); // Minimum 100px
                                        iframe.style.height = `${height}px`;

                                        // Also trigger ResizeObserver if it exists
                                        if (
                                            resizeObserverRef.current &&
                                            frameDoc.body
                                        ) {
                                            // Manually trigger by temporarily changing body content
                                            // This forces ResizeObserver to fire
                                            const temp =
                                                frameDoc.body.style.display;
                                            frameDoc.body.style.display =
                                                "none";
                                            void frameDoc.body.offsetHeight;
                                            frameDoc.body.style.display = temp;
                                        }
                                    }
                                });
                            });

                            return; // Skip the reload
                        } catch (error) {
                            // If we can't access the document, fall through to full reload
                            console.warn(
                                "Cannot update iframe content directly, reloading:",
                                error,
                            );
                        }
                    }

                    // Full reload needed (first load, head content changed, theme changed, or incremental update failed)
                    if (
                        !isInitializedRef.current ||
                        headContentChanged ||
                        themeChanged
                    ) {
                        setIsLoading(true);
                        clearAllPortals();
                        // Reset initialization state to ensure clean reload
                        isInitializedRef.current = false;
                    }

                    // Generate the filtered HTML document using the shared template
                    const html = generateFilteredSandboxHtml(content, theme);

                    // Update references
                    lastHeadContentRef.current = headContent;
                    lastThemeRef.current = theme;

                    // Clear srcdoc first to ensure clean reload
                    iframe.srcdoc = "";
                    // Use setTimeout to ensure browser processes the clear
                    setTimeout(() => {
                        if (iframe && iframe.parentNode) {
                            iframe.srcdoc = html;
                        }
                    }, 0);

                    // Handle iframe load
                    iframe.onload = () => {
                        let frameDoc;
                        try {
                            frameDoc =
                                iframe.contentDocument ||
                                iframe.contentWindow.document;
                        } catch (error) {
                            console.warn(
                                "Cannot access iframe document due to cross-origin restrictions:",
                                error,
                            );
                            setIsLoading(false);
                            return;
                        }

                        if (!frameDoc || !frameDoc.body) {
                            console.warn(
                                "Frame document or body not accessible",
                            );
                            setIsLoading(false);
                            return;
                        }

                        // Clean up any existing observers
                        if (resizeObserverRef.current) {
                            resizeObserverRef.current.disconnect();
                        }
                        if (mutationObserverRef.current) {
                            mutationObserverRef.current.disconnect();
                        }

                        // Setup new resize observer
                        const resizeObserver = new ResizeObserver((entries) => {
                            for (const entry of entries) {
                                const height = Math.max(
                                    entry.contentRect.height,
                                    entry.target.scrollHeight,
                                );
                                iframe.style.height = `${height}px`;
                            }
                        });

                        // Ensure body exists before observing
                        if (frameDoc.body) {
                            resizeObserver.observe(frameDoc.body);
                            resizeObserverRef.current = resizeObserver;
                        }

                        // Setup mutation observer to watch for pre elements being added
                        const mutationObserver = new MutationObserver(
                            (mutations) => {
                                let shouldProcess = false;

                                mutations.forEach((mutation, mutationIndex) => {
                                    // Skip mutations caused by our own portal containers
                                    if (mutation.type === "childList") {
                                        mutation.addedNodes.forEach(
                                            (node, nodeIndex) => {
                                                if (
                                                    node.nodeType ===
                                                    Node.ELEMENT_NODE
                                                ) {
                                                    // Skip if it's our own portal container
                                                    if (
                                                        node.classList &&
                                                        node.classList.contains(
                                                            "react-portal-container",
                                                        )
                                                    ) {
                                                        return;
                                                    }

                                                    // Check if the added node is a pre element with llm-output class
                                                    const isPreWithClass =
                                                        node.tagName ===
                                                            "PRE" &&
                                                        node.classList &&
                                                        node.classList.contains(
                                                            "llm-output",
                                                        );

                                                    // Check if it contains pre.llm-output elements
                                                    const containsPre =
                                                        node.querySelector &&
                                                        node.querySelector(
                                                            "pre.llm-output",
                                                        );

                                                    if (
                                                        isPreWithClass ||
                                                        containsPre
                                                    ) {
                                                        shouldProcess = true;
                                                    }
                                                } else if (
                                                    node.nodeType ===
                                                    Node.TEXT_NODE
                                                ) {
                                                    // Text nodes are children, check parent
                                                    const parent =
                                                        node.parentNode;
                                                    if (
                                                        parent &&
                                                        parent.tagName ===
                                                            "PRE" &&
                                                        parent.classList &&
                                                        parent.classList.contains(
                                                            "llm-output",
                                                        )
                                                    ) {
                                                        shouldProcess = true;
                                                    }
                                                }
                                            },
                                        );
                                    } else if (
                                        mutation.type === "characterData" ||
                                        mutation.type === "attributes"
                                    ) {
                                        // Check if the mutation affects a pre element or its content
                                        let target = mutation.target;

                                        // If it's a text node, check its parent
                                        if (
                                            target.nodeType === Node.TEXT_NODE
                                        ) {
                                            target = target.parentNode;
                                        }

                                        // Skip if it's our own portal container
                                        if (
                                            target &&
                                            target.classList &&
                                            target.classList.contains(
                                                "react-portal-container",
                                            )
                                        ) {
                                            return;
                                        }

                                        // Check if the target is a pre element with llm-output class
                                        const isPreWithClass =
                                            target &&
                                            target.tagName === "PRE" &&
                                            target.classList &&
                                            target.classList.contains(
                                                "llm-output",
                                            );

                                        if (isPreWithClass) {
                                            // Pre element with llm-output class changed, process it
                                            shouldProcess = true;
                                        }

                                        // Also check if any pre elements are descendants of the changed node
                                        if (
                                            target &&
                                            target.querySelector &&
                                            target.querySelector(
                                                "pre.llm-output",
                                            )
                                        ) {
                                            shouldProcess = true;
                                        }
                                    }
                                });

                                if (shouldProcess) {
                                    processPreElements(frameDoc);
                                } else {
                                }
                            },
                        );

                        // Start observing
                        mutationObserver.observe(frameDoc.body, {
                            childList: true,
                            subtree: true,
                            characterData: true,
                            attributes: true,
                            attributeFilter: ["class", "data-processed"],
                        });
                        mutationObserverRef.current = mutationObserver;

                        // Process any existing pre elements
                        processPreElements(frameDoc);

                        // Setup message handling for iframe->parent communication
                        iframe.contentWindow.addEventListener(
                            "message",
                            (event) => {
                                if (event.origin !== window.location.origin) {
                                    return;
                                }
                                // Handle messages from the iframe
                                console.log(
                                    "Message from sandbox:",
                                    event.data,
                                );
                            },
                        );

                        setIsLoading(false);
                        isInitializedRef.current = true;
                    };

                    // Handle errors
                    iframe.onerror = (error) => {
                        console.error("Sandbox iframe error:", error);
                        setIsLoading(false);
                        isInitializedRef.current = false;
                    };
                } catch (error) {
                    console.error("Error setting up sandbox:", error);
                    setIsLoading(false);
                    isInitializedRef.current = false;
                }
            };

            // Call updateContent directly
            updateContent();

            // Cleanup
            return () => {
                if (resizeObserverRef.current) {
                    resizeObserverRef.current.disconnect();
                    resizeObserverRef.current = null;
                }
                if (mutationObserverRef.current) {
                    mutationObserverRef.current.disconnect();
                    mutationObserverRef.current = null;
                }
                // Clear iframe content to force fresh load on next mount
                if (iframe && iframe.contentWindow) {
                    try {
                        // Clear srcdoc to force reload
                        iframe.srcdoc = "";
                    } catch (e) {
                        console.warn(
                            "[OutputSandbox] Could not clear iframe srcdoc:",
                            e,
                        );
                    }
                }
                // Reset initialization state
                isInitializedRef.current = false;
                clearAllPortals();
            };
        }, [content, theme, processPreElements, clearAllPortals]);

        // Send theme change messages to iframe when theme changes
        useEffect(() => {
            if (iframeRef.current && iframeRef.current.contentWindow) {
                try {
                    iframeRef.current.contentWindow.postMessage(
                        {
                            type: "theme-change",
                            theme: theme,
                        },
                        window.location.origin,
                    );
                } catch (error) {
                    console.warn(
                        "Could not send theme change message to iframe:",
                        error,
                    );
                }
            } else {
            }
        }, [theme]);

        return (
            <div
                className="relative w-full h-full"
                style={{ minHeight: height === "100%" ? "100%" : undefined }}
            >
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-700 z-10">
                        <div className="text-gray-500">Loading...</div>
                    </div>
                )}
                <iframe
                    ref={iframeRef}
                    style={{
                        width: "100%",
                        height,
                        border: "none",
                        backgroundColor: "transparent",
                        opacity: isLoading ? 0 : 1,
                        transition: "opacity 0.2s",
                        display: "block", // Ensure iframe is displayed as block element
                        visibility: isLoading ? "hidden" : "visible", // Add visibility for mobile
                    }}
                    sandbox="allow-scripts allow-popups allow-forms allow-same-origin allow-downloads allow-presentation"
                    title="Output Sandbox"
                />
                {/* Render React portals for detected pre elements */}
                {Array.from(portalContainers.entries()).map(
                    ([portalId, { container, component, frameDoc }]) => {
                        if (container && frameDoc) {
                            return (
                                <React.Fragment key={portalId}>
                                    {createPortal(component, container)}
                                </React.Fragment>
                            );
                        }
                        return null;
                    },
                )}
            </div>
        );
    },
);

export default OutputSandbox;
