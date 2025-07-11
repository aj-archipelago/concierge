import React, { useEffect, useRef, useState, forwardRef } from "react";
import { createPortal } from "react-dom";
import { convertMessageToMarkdown } from "../chat/ChatMessage";

const OutputSandbox = forwardRef(({ content, height = "300px", theme = "light" }, ref) => {
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
    const cleanupOldPortals = (frameDoc) => {
        setPortalContainers((prev) => {
            const newMap = new Map();
            prev.forEach((value, key) => {
                // Check if the container still exists in the document
                if (frameDoc.contains(value.container)) {
                    newMap.set(key, value);
                } else {
                    console.log("Removing old portal container:", key);
                }
            });
            return newMap;
        });
    };

    // Function to process pre elements with JSON content
    const processPreElements = (frameDoc) => {
        if (!frameDoc || !frameDoc.body) {
            console.warn("Frame document not accessible");
            return;
        }

        // Clean up old portal containers first
        cleanupOldPortals(frameDoc);

        const preElements = frameDoc.querySelectorAll("pre.llm-output");
        console.log("Found pre elements:", preElements.length);

        preElements.forEach((preElement) => {
            // Check if this element was already processed
            const wasProcessed = preElement.dataset.processed === "true";

            // If it was processed, check if the content has changed
            if (wasProcessed) {
                const currentContent = preElement.textContent.trim();
                const lastProcessedContent = preElement.dataset.lastContent;

                // If content hasn't changed, skip processing
                if (currentContent === lastProcessedContent) {
                    console.log(
                        "Skipping already processed element with unchanged content",
                    );
                    return;
                }

                // If content has changed, we need to reprocess
                console.log("Content changed, reprocessing element");

                // Find and remove the existing portal container
                const existingContainer = frameDoc.querySelector(
                    `[data-portal-id="${preElement.dataset.portalId}"]`,
                );
                if (existingContainer) {
                    existingContainer.parentNode.replaceChild(
                        preElement,
                        existingContainer,
                    );
                }

                // Clear the processed flag
                delete preElement.dataset.processed;
                delete preElement.dataset.portalId;
                delete preElement.dataset.lastContent;
            }

            try {
                const textContent = preElement.textContent.trim();
                console.log(
                    "Processing pre element with content:",
                    textContent.substring(0, 100) + "...",
                );

                const jsonData = JSON.parse(textContent);

                // Check if it has the expected structure with markdown and citations
                if (jsonData.markdown && Array.isArray(jsonData.citations)) {
                    console.log("Valid JSON found, creating portal container");

                    // Create a container for the React component
                    const container = frameDoc.createElement("div");
                    container.className = "react-portal-container";
                    const portalId = `portal-${Date.now()}-${Math.random()}`;
                    container.dataset.portalId = portalId;

                    // Replace the pre element with the container
                    preElement.parentNode.replaceChild(container, preElement);

                    // Mark as processed and store content hash
                    preElement.dataset.processed = "true";
                    preElement.dataset.portalId = portalId;
                    preElement.dataset.lastContent = textContent;

                    // Create a message object for convertMessageToMarkdown
                    const message = {
                        payload: jsonData.markdown,
                        tool: JSON.stringify({ citations: jsonData.citations }),
                    };

                    console.log(
                        "Calling convertMessageToMarkdown with:",
                        message,
                    );

                    // Convert to React component
                    const reactComponent = convertMessageToMarkdown(
                        message,
                        true,
                    );

                    console.log("React component created:", reactComponent);

                    // Store the portal container for rendering
                    setPortalContainers((prev) => {
                        const newMap = new Map(prev);
                        newMap.set(portalId, {
                            container,
                            component: reactComponent,
                            frameDoc,
                        });
                        console.log(
                            "Portal containers updated, total:",
                            newMap.size,
                        );
                        return newMap;
                    });
                } else {
                    console.log("JSON missing required fields:", jsonData);
                }
            } catch (error) {
                console.warn("Failed to parse JSON in pre element:", error);
            }
        });
    };

    useEffect(() => {
        if (!iframeRef.current) return;

        const iframe = iframeRef.current;

        // Clear existing portal containers when content changes
        setPortalContainers(new Map());

        const setupFrame = async () => {
            try {
                setIsLoading(true);

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
                        <body>${content}</body>
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
                        console.warn("Frame document or body not accessible");
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
                                if (mutation.type === "childList") {
                                    mutation.addedNodes.forEach((node) => {
                                        if (
                                            node.nodeType === Node.ELEMENT_NODE
                                        ) {
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
                                    if (target.nodeType === Node.TEXT_NODE) {
                                        target = target.parentNode;
                                    }

                                    // Check if the target is a pre element with llm-output class
                                    if (
                                        target &&
                                        target.tagName === "PRE" &&
                                        target.classList.contains("llm-output")
                                    ) {
                                        shouldProcess = true;
                                    }

                                    // Also check if any pre elements are descendants of the changed node
                                    if (
                                        target &&
                                        target.querySelector &&
                                        target.querySelector("pre.llm-output")
                                    ) {
                                        shouldProcess = true;
                                    }
                                }
                            });

                            if (shouldProcess) {
                                console.log(
                                    "Mutation detected, processing pre elements",
                                );
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
                            if (event.origin !== window.location.origin) return;
                            // Handle messages from the iframe
                            console.log("Message from sandbox:", event.data);
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
                iframe.contentWindow.removeEventListener("message", () => {});
            }
        };
    }, [content, theme]);

    // Send theme change messages to iframe when theme changes
    useEffect(() => {
        if (iframeRef.current && iframeRef.current.contentWindow) {
            try {
                iframeRef.current.contentWindow.postMessage(
                    {
                        type: 'theme-change',
                        theme: theme
                    },
                    window.location.origin
                );
            } catch (error) {
                console.warn('Could not send theme change message to iframe:', error);
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
                    console.log(
                        "Rendering portal:",
                        portalId,
                        "container:",
                        container,
                        "component:",
                        component,
                    );
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
});

export default OutputSandbox;
