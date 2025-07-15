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
                    }

                    try {
                        if (!preElement.textContent) {
                            return;
                        }

                        const textContent = preElement.textContent.trim();

                        const jsonData = JSON.parse(textContent);

                        // Check if it has the expected structure with markdown and citations
                        if (
                            jsonData.markdown &&
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
                                payload: jsonData.markdown,
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
            if (!iframeRef.current) return;

            const iframe = iframeRef.current;

            // Clear all portal containers when iframe is being recreated
            clearAllPortals();

            const setupFrame = async () => {
                try {
                    setIsLoading(true);

                    // Function to filter out dark classes from HTML content
                    const filterDarkClasses = (content, theme) => {
                        if (theme === "dark") {
                            return content; // Keep all classes for dark theme
                        }

                        // Remove all dark: classes from the HTML content
                        return content.replace(/\bdark:[^\s"'`>]+/g, "");
                    };

                    // Filter out dark classes when theme is light
                    const filteredContent = filterDarkClasses(content, theme);

                    // Create a base tag to handle relative URLs
                    const base = document.createElement("base");
                    base.href = window.location.origin;

                    // Create proper HTML structure with theme information
                    const html = `
                    <!DOCTYPE html>
                    <html data-theme="${theme}">
                        <head>
                            <meta charset="utf-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1">
                            <style>
                                body { 
                                    margin: 0; 
                                    font-family: system-ui, -apple-system, sans-serif;
                                }
                                /* Ensure images don't overflow */
                                img { max-width: 100%; height: auto; }
                                
                                /* Theme-aware styles for applets */
                                html[data-theme="dark"] {
                                    color-scheme: dark;
                                }
                                html[data-theme="light"] {
                                    color-scheme: light;
                                }
                                
                                /* CSS custom property for applets to use */
                                :root {
                                    --prefers-color-scheme: ${theme};
                                }
                                
                                /* Override prefers-color-scheme media queries based on theme */
                                html[data-theme="dark"] {
                                    /* Force dark mode regardless of system preference */
                                    color-scheme: dark;
                                }
                                
                                html[data-theme="light"] {
                                    /* Force light mode regardless of system preference */
                                    color-scheme: light;
                                }
                                
                                /* Hide pre elements with llm-output class - they're replaced by React portals */
                                pre.llm-output {
                                    display: none !important;
                                }
                            </style>
                            <script>
                                // Make theme available to applets via JavaScript
                                window.LABEEB_THEME = "${theme}";
                                window.LABEEB_PREFERS_COLOR_SCHEME = "${theme}";
                                
                                // Listen for theme changes from parent
                                window.addEventListener('message', function(event) {
                                    if (event.data && event.data.type === 'theme-change') {
                                        const newTheme = event.data.theme;
                                        document.documentElement.setAttribute('data-theme', newTheme);
                                        document.documentElement.style.setProperty('--prefers-color-scheme', newTheme);
                                        window.LABEEB_THEME = newTheme;
                                        window.LABEEB_PREFERS_COLOR_SCHEME = newTheme;
                                    }
                                });
                            </script>
                        </head>
                        <body>${filteredContent}</body>
                    </html>
                `;

                    // Use srcdoc for better security and performance
                    iframe.srcdoc = html;

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

                                mutations.forEach((mutation) => {
                                    // Skip mutations caused by our own portal containers
                                    if (mutation.type === "childList") {
                                        mutation.addedNodes.forEach((node) => {
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

                                                // Check if the added node is a pre element or contains pre elements
                                                if (
                                                    node.tagName === "PRE" ||
                                                    node.querySelector(
                                                        "pre.llm-output",
                                                    )
                                                ) {
                                                    shouldProcess = true;
                                                }
                                            }
                                        });
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
                                        if (
                                            target &&
                                            target.tagName === "PRE" &&
                                            target.classList.contains(
                                                "llm-output",
                                            )
                                        ) {
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
                                if (event.origin !== window.location.origin)
                                    return;
                                // Handle messages from the iframe
                                console.log(
                                    "Message from sandbox:",
                                    event.data,
                                );
                            },
                        );

                        setIsLoading(false);
                    };

                    // Handle errors
                    iframe.onerror = (error) => {
                        console.error("Sandbox iframe error:", error);
                        setIsLoading(false);
                    };
                } catch (error) {
                    console.error("Error setting up sandbox:", error);
                    setIsLoading(false);
                }
            };

            setupFrame();

            // Cleanup
            return () => {
                if (resizeObserverRef.current) {
                    resizeObserverRef.current.disconnect();
                }
                if (mutationObserverRef.current) {
                    mutationObserverRef.current.disconnect();
                }
                if (iframe.contentWindow) {
                    iframe.contentWindow.removeEventListener(
                        "message",
                        () => {},
                    );
                }
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
            }
        }, [theme]);

        return (
            <div className="relative">
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
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
