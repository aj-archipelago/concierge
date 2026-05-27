import { Node } from "@tiptap/core";
import i18n from "../../i18n";
import { getDownloadUrl } from "../../utils/fileDownloadUtils";

export const RawHtml = Node.create({
    name: "rawHtml",
    group: "block",
    atom: true,
    draggable: true,

    addAttributes() {
        return {
            html: {
                default: "",
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="raw-html"]',
                getAttrs: (element) => {
                    if (typeof element === "string") {
                        return false;
                    }
                    // Get HTML from data-html attribute or innerHTML
                    const htmlAttr = element.getAttribute("data-html");
                    const html =
                        htmlAttr !== null ? htmlAttr : element.innerHTML || "";
                    return {
                        html: html,
                    };
                },
            },
        ];
    },

    renderHTML({ node, HTMLAttributes }) {
        // Store HTML in data attribute for serialization
        // The actual rendering happens in addNodeView
        return [
            "div",
            {
                ...HTMLAttributes,
                "data-type": "raw-html",
                "data-html": node.attrs.html || "",
                class: "raw-html-wrapper",
            },
        ];
    },

    addNodeView() {
        return ({ node, getPos, editor }) => {
            // Check if editor view is available (may not be mounted yet when switching tabs)
            // Wrap in try-catch to handle TipTap's internal validation errors
            try {
                if (!editor || !editor.view || !editor.view.dom) {
                    // Return a minimal node view if editor is not ready
                    const placeholder = document.createElement("div");
                    placeholder.className = "raw-html-wrapper";
                    placeholder.setAttribute("data-type", "raw-html");
                    placeholder.style.padding = "1rem";
                    placeholder.style.border = "1px dashed #ccc";
                    placeholder.textContent = i18n.t("Loading widget...");
                    return {
                        dom: placeholder,
                        update: () => false,
                        destroy: () => {},
                    };
                }
            } catch (error) {
                // TipTap validation error or editor not ready - return placeholder
                console.debug(
                    "Editor not ready for widget, using placeholder:",
                    error,
                );
                const placeholder = document.createElement("div");
                placeholder.className = "raw-html-wrapper";
                placeholder.setAttribute("data-type", "raw-html");
                placeholder.style.padding = "1rem";
                placeholder.style.border = "1px dashed #ccc";
                placeholder.textContent = i18n.t("Loading widget...");
                return {
                    dom: placeholder,
                    update: () => false,
                    destroy: () => {},
                };
            }

            // Helper function to process HTML and replace Azure Blob Storage image URLs with proxied versions
            const processHtmlForImages = (html) => {
                if (!html) return html;

                // Create a temporary DOM element to parse and modify HTML
                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = html;

                // Find all img tags
                const images = tempDiv.querySelectorAll("img");
                images.forEach((img) => {
                    const src = img.getAttribute("src");
                    const proxiedUrl = src ? getDownloadUrl(src) : src;
                    if (proxiedUrl && proxiedUrl !== src) {
                        img.setAttribute("src", proxiedUrl);
                        // Add crossorigin attribute to help with CORS
                        img.setAttribute("crossorigin", "anonymous");
                        // Add error handler to fallback to original URL if proxy fails
                        img.setAttribute("data-original-src", src);
                    }
                });

                // Also check for background-image in style attributes
                const elementsWithStyles = tempDiv.querySelectorAll("[style]");
                elementsWithStyles.forEach((el) => {
                    const style = el.getAttribute("style");
                    if (style && style.includes("background-image")) {
                        const urlMatch = style.match(
                            /url\(['"]?([^'"]+)['"]?\)/,
                        );
                        const bgProxiedUrl = urlMatch?.[1]
                            ? getDownloadUrl(urlMatch[1])
                            : null;
                        if (bgProxiedUrl && bgProxiedUrl !== urlMatch[1]) {
                            el.setAttribute(
                                "style",
                                style.replace(
                                    urlMatch[0],
                                    `url('${bgProxiedUrl}')`,
                                ),
                            );
                        }
                    }
                });

                return tempDiv.innerHTML;
            };

            // Create wrapper container
            const wrapper = document.createElement("div");
            wrapper.setAttribute("data-type", "raw-html");
            wrapper.setAttribute("data-html", node.attrs.html || "");
            wrapper.className = "raw-html-wrapper";
            wrapper.contentEditable = "false";

            // Create iframe for isolated HTML widget rendering
            // Using only 'allow-scripts' without 'allow-same-origin' for better security isolation
            // This prevents the iframe from accessing parent page data while still allowing scripts to run
            const iframe = document.createElement("iframe");
            iframe.className = "raw-html-content";
            iframe.setAttribute("sandbox", "allow-scripts");
            iframe.setAttribute("scrolling", "no");
            iframe.style.border = "none";
            iframe.style.width = "100%";
            iframe.style.minHeight = "100px";
            iframe.style.display = "block";
            iframe.style.pointerEvents = "auto"; // Ensure iframe can receive pointer events

            // Generate a unique identifier for this iframe instance to validate messages
            const iframeId = `raw-html-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Process HTML to replace Azure Blob Storage image URLs with proxied versions
            const widgetHtml = processHtmlForImages(node.attrs.html || "");
            const completeHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HTML Widget</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Georgia:wght@400;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: Georgia, serif;
            font-size: 16px;
            line-height: 1.6;
            color: #333;
            background: transparent;
            padding: 0;
            margin: 0;
        }
        h1, h2, h3, h4, h5, h6 {
            font-family: 'Roboto', sans-serif;
            font-weight: 500;
            margin: 0;
        }
        /* Ensure widget content fills the iframe */
        html, body {
            width: 100%;
            min-height: 100%;
        }
    </style>
</head>
<body>
    ${widgetHtml}
    <script>
        // Auto-resize iframe to content height
        function resizeIframe() {
            const height = Math.max(
                document.body.scrollHeight,
                document.body.offsetHeight,
                document.documentElement.clientHeight,
                document.documentElement.scrollHeight,
                document.documentElement.offsetHeight
            );
            if (window.parent !== window) {
                window.parent.postMessage({
                    type: 'resize-iframe',
                    height: height,
                    iframeId: '${iframeId}'
                }, '*');
            }
        }
        
        // Resize on load and when content changes
        window.addEventListener('load', resizeIframe);
        if (document.readyState === 'complete') {
            resizeIframe();
        } else {
            window.addEventListener('DOMContentLoaded', resizeIframe);
        }
        
        // Resize when images load
        const images = document.querySelectorAll('img');
        images.forEach(img => {
            if (img.complete) {
                resizeIframe();
            } else {
                img.addEventListener('load', resizeIframe);
                img.addEventListener('error', (e) => {
                    // If proxied image fails, try original URL as fallback
                    const originalSrc = img.getAttribute('data-original-src');
                    if (originalSrc && img.src.includes('/api/image-proxy')) {
                        console.warn('Proxied image failed, trying original URL:', originalSrc);
                        img.src = originalSrc;
                    }
                    resizeIframe();
                });
            }
        });
        
        // Use MutationObserver to detect content changes
        const observer = new MutationObserver(resizeIframe);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true
        });
    </script>
</body>
</html>`;

            // Listen for resize messages from iframe
            const handleMessage = (event) => {
                // Verify message is from our iframe
                // With srcdoc, origin will be "null", so we check the iframeId instead
                if (
                    event.data &&
                    event.data.type === "resize-iframe" &&
                    event.data.iframeId === iframeId
                ) {
                    iframe.style.height = event.data.height + "px";
                }
            };
            window.addEventListener("message", handleMessage);

            // Get editor element for event handling
            // Check if editor view is available (may not be mounted yet when switching tabs)
            // Use a very defensive check to avoid TipTap's internal validation errors
            let editorElement = null;
            try {
                // Access properties in a way that won't trigger TipTap's validation
                const hasView =
                    editor !== null &&
                    editor !== undefined &&
                    typeof editor === "object" &&
                    Object.prototype.hasOwnProperty.call(editor, "view");
                if (hasView) {
                    try {
                        const view = editor.view;
                        if (view && typeof view === "object" && "dom" in view) {
                            editorElement = view.dom;
                        }
                    } catch (viewError) {
                        // View access failed, likely not ready
                        console.debug("Editor view access failed:", viewError);
                    }
                }
            } catch (error) {
                // Editor view not available, continue without editor-level event handling
                console.debug("Editor view not available for widget:", error);
                editorElement = null;
            }

            // Clean up listeners when node is destroyed
            const cleanup = () => {
                window.removeEventListener("message", handleMessage);
                wrapper.removeEventListener("mousedown", handleMouseDown, true);
                wrapper.removeEventListener("click", handleClick, true);
                if (editorElement) {
                    editorElement.removeEventListener(
                        "mousedown",
                        handleEditorMouseDown,
                        true,
                    );
                }
            };

            // Use srcdoc for more reliable iframe content loading
            iframe.srcdoc = completeHtml;

            // Set initial height after iframe loads
            // Note: Without allow-same-origin, we cannot access contentDocument directly
            // The iframe will send its height via postMessage, so we just set a default here
            iframe.onload = () => {
                // Default height - will be updated by postMessage from iframe
                iframe.style.height = "200px";
            };

            // Check if a point is within the iframe's bounds (including a small margin for edge clicks)
            const isPointOverIframe = (x, y) => {
                const iframeRect = iframe.getBoundingClientRect();
                // Add small margin to account for border/padding - clicks very close to iframe edge
                // should still be considered as iframe clicks
                const margin = 2;
                return (
                    x >= iframeRect.left - margin &&
                    x <= iframeRect.right + margin &&
                    y >= iframeRect.top - margin &&
                    y <= iframeRect.bottom + margin
                );
            };

            // Handle mousedown - prevent ProseMirror drag when clicking on iframe
            const handleMouseDown = (e) => {
                const target = e.target;

                // If clicking on control buttons, let them handle it normally
                if (
                    target.closest(".raw-html-copy") ||
                    target.closest(".raw-html-delete")
                ) {
                    return;
                }

                // Check if click is over the iframe
                const clickX = e.clientX;
                const clickY = e.clientY;
                const overIframe =
                    target === iframe || isPointOverIframe(clickX, clickY);

                if (overIframe) {
                    // Click is on iframe - prevent ProseMirror from handling it (which would start a drag)
                    // Stop propagation but don't prevent default - let the natural click behavior happen
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    // Focus the iframe to ensure it can receive events
                    // Note: Without allow-same-origin, we cannot access iframe content directly
                    // but focusing the iframe element itself should still work
                    try {
                        iframe.focus();
                    } catch (err) {
                        // If focusing fails, the iframe will handle events naturally
                        console.debug("Could not focus iframe:", err);
                    }
                    return;
                }

                // Click is on wrapper border/padding - allow ProseMirror to handle dragging
                // Don't stop propagation, so TipTap/ProseMirror can handle the drag
            };

            // Handle click events - ensure clicks on iframe reach the iframe
            const handleClick = (e) => {
                const target = e.target;

                // If clicking on control buttons, let them handle it
                if (
                    target.closest(".raw-html-copy") ||
                    target.closest(".raw-html-delete")
                ) {
                    return;
                }

                // Check if click is over the iframe
                const clickX = e.clientX;
                const clickY = e.clientY;
                const overIframe =
                    target === iframe || isPointOverIframe(clickX, clickY);

                if (overIframe) {
                    // Click is on iframe - stop propagation to allow iframe to handle it
                    // Don't prevent default - let the click reach the iframe naturally
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                }
            };

            // Also handle at the editor level if possible - try to prevent TipTap from capturing
            // events on the wrapper when clicking on iframe
            const handleEditorMouseDown = (e) => {
                // Check if the click originated from our wrapper's iframe area
                const path = e.composedPath();
                const wrapperInPath = path.find((el) => el === wrapper);
                if (wrapperInPath) {
                    const clickX = e.clientX;
                    const clickY = e.clientY;
                    if (isPointOverIframe(clickX, clickY)) {
                        // This click is over our iframe - prevent TipTap from handling it
                        e.stopPropagation();
                    }
                }
            };

            // Add listeners in capture phase to intercept before TipTap/ProseMirror
            wrapper.addEventListener("mousedown", handleMouseDown, true);
            wrapper.addEventListener("click", handleClick, true);

            // Also add listener to editor element to catch events before TipTap processes them
            if (editorElement) {
                editorElement.addEventListener(
                    "mousedown",
                    handleEditorMouseDown,
                    true,
                );
            }

            wrapper.appendChild(iframe);

            // Create copy button
            const copyButton = document.createElement("button");
            copyButton.className = "raw-html-copy";
            copyButton.innerHTML =
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
            copyButton.setAttribute("aria-label", "Copy raw HTML widget");
            copyButton.setAttribute("type", "button");
            copyButton.setAttribute("tabindex", "-1");

            // Handle copy click - copy the widget HTML content (not the iframe wrapper)
            copyButton.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();

                try {
                    await navigator.clipboard.writeText(node.attrs.html || "");
                    // Visual feedback
                    const originalHTML = copyButton.innerHTML;
                    copyButton.innerHTML =
                        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                    copyButton.style.color = "#10b981";
                    setTimeout(() => {
                        copyButton.innerHTML = originalHTML;
                        copyButton.style.color = "";
                    }, 2000);
                } catch (err) {
                    console.error("Failed to copy HTML:", err);
                }
            });

            wrapper.appendChild(copyButton);

            // Create delete button
            const deleteButton = document.createElement("button");
            deleteButton.className = "raw-html-delete";
            deleteButton.innerHTML = "×";
            deleteButton.setAttribute("aria-label", "Delete raw HTML widget");
            deleteButton.setAttribute("type", "button");
            deleteButton.setAttribute("tabindex", "-1");

            // Handle delete click
            deleteButton.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();

                const pos = typeof getPos === "function" ? getPos() : null;
                if (pos !== null && pos !== undefined) {
                    editor.commands.deleteRange({
                        from: pos,
                        to: pos + node.nodeSize,
                    });
                }
            });

            wrapper.appendChild(deleteButton);

            // Store cleanup function on wrapper for later use
            wrapper._cleanup = cleanup;

            return {
                dom: wrapper,
                update: (updatedNode) => {
                    if (updatedNode.type !== this.type) {
                        return false;
                    }
                    if (updatedNode.attrs.html !== node.attrs.html) {
                        // Helper function to process HTML and replace Azure Blob Storage image URLs with proxied versions
                        const processHtmlForImages = (html) => {
                            if (!html) return html;

                            // Create a temporary DOM element to parse and modify HTML
                            const tempDiv = document.createElement("div");
                            tempDiv.innerHTML = html;

                            // Find all img tags
                            const images = tempDiv.querySelectorAll("img");
                            images.forEach((img) => {
                                const src = img.getAttribute("src");
                                const proxiedUrl = src
                                    ? getDownloadUrl(src)
                                    : src;
                                if (proxiedUrl && proxiedUrl !== src) {
                                    img.setAttribute("src", proxiedUrl);
                                    // Add crossorigin attribute to help with CORS
                                    img.setAttribute(
                                        "crossorigin",
                                        "anonymous",
                                    );
                                    // Add error handler to fallback to original URL if proxy fails
                                    img.setAttribute("data-original-src", src);
                                }
                            });

                            // Also check for background-image in style attributes
                            const elementsWithStyles =
                                tempDiv.querySelectorAll("[style]");
                            elementsWithStyles.forEach((el) => {
                                const style = el.getAttribute("style");
                                if (
                                    style &&
                                    style.includes("background-image")
                                ) {
                                    const urlMatch = style.match(
                                        /url\(['"]?([^'"]+)['"]?\)/,
                                    );
                                    const bgProxiedUrl = urlMatch?.[1]
                                        ? getDownloadUrl(urlMatch[1])
                                        : null;
                                    if (
                                        bgProxiedUrl &&
                                        bgProxiedUrl !== urlMatch[1]
                                    ) {
                                        el.setAttribute(
                                            "style",
                                            style.replace(
                                                urlMatch[0],
                                                `url('${bgProxiedUrl}')`,
                                            ),
                                        );
                                    }
                                }
                            });

                            return tempDiv.innerHTML;
                        };

                        // Update iframe content
                        const updatedWidgetHtml = processHtmlForImages(
                            updatedNode.attrs.html || "",
                        );
                        const updatedCompleteHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HTML Widget</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Georgia:wght@400;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: Georgia, serif;
            font-size: 16px;
            line-height: 1.6;
            color: #333;
            background: transparent;
            padding: 0;
            margin: 0;
        }
        h1, h2, h3, h4, h5, h6 {
            font-family: 'Roboto', sans-serif;
            font-weight: 500;
            margin: 0;
        }
        html, body {
            width: 100%;
            min-height: 100%;
        }
    </style>
</head>
<body>
    ${updatedWidgetHtml}
    <script>
        function resizeIframe() {
            const height = Math.max(
                document.body.scrollHeight,
                document.body.offsetHeight,
                document.documentElement.clientHeight,
                document.documentElement.scrollHeight,
                document.documentElement.offsetHeight
            );
            if (window.parent !== window) {
                window.parent.postMessage({
                    type: 'resize-iframe',
                    height: height,
                    iframeId: '${iframeId}'
                }, '*');
            }
        }
        window.addEventListener('load', resizeIframe);
        if (document.readyState === 'complete') {
            resizeIframe();
        } else {
            window.addEventListener('DOMContentLoaded', resizeIframe);
        }
        const images = document.querySelectorAll('img');
        images.forEach(img => {
            if (img.complete) {
                resizeIframe();
            } else {
                img.addEventListener('load', resizeIframe);
                img.addEventListener('error', (e) => {
                    // If proxied image fails, try original URL as fallback
                    const originalSrc = img.getAttribute('data-original-src');
                    if (originalSrc && img.src.includes('/api/image-proxy')) {
                        console.warn('Proxied image failed, trying original URL:', originalSrc);
                        img.src = originalSrc;
                    }
                    resizeIframe();
                });
            }
        });
        const observer = new MutationObserver(resizeIframe);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true
        });
    </script>
</body>
</html>`;

                        try {
                            // Update iframe content using srcdoc
                            iframe.srcdoc = updatedCompleteHtml;
                        } catch (e) {
                            console.error("Failed to update iframe:", e);
                        }

                        wrapper.setAttribute(
                            "data-html",
                            updatedNode.attrs.html || "",
                        );
                        node.attrs.html = updatedNode.attrs.html;
                    }
                    return true;
                },
                destroy: () => {
                    // Clean up message listener
                    if (wrapper._cleanup) {
                        wrapper._cleanup();
                    }
                },
            };
        };
    },

    addCommands() {
        return {
            setRawHtml:
                (html) =>
                ({ commands }) => {
                    return commands.insertContent({
                        type: this.name,
                        attrs: { html: html || "" },
                    });
                },
            updateRawHtml:
                ({ html, widgetIndex = null } = {}) =>
                ({ tr, state, dispatch, commands }) => {
                    if (!html) {
                        return false;
                    }

                    const { doc } = state;
                    const rawHtmlNodes = [];

                    // Traverse the document to find all rawHtml nodes
                    doc.descendants((node, pos) => {
                        if (node.type.name === this.name) {
                            rawHtmlNodes.push({ node, pos });
                        }
                    });

                    // If widgets exist, update the specified one (or first if no index specified)
                    if (rawHtmlNodes.length > 0 && dispatch) {
                        // Determine which widget to update
                        let indexToUpdate = 0;
                        if (widgetIndex !== null && widgetIndex !== undefined) {
                            // Clamp index to valid range
                            indexToUpdate = Math.max(
                                0,
                                Math.min(widgetIndex, rawHtmlNodes.length - 1),
                            );
                        }

                        const targetWidget = rawHtmlNodes[indexToUpdate];
                        if (targetWidget) {
                            // Update the node
                            tr.setNodeMarkup(targetWidget.pos, undefined, {
                                ...targetWidget.node.attrs,
                                html: html,
                            });
                            return true;
                        }
                    }

                    // No widgets found, insert a new one
                    return commands.setRawHtml(html);
                },
        };
    },
});
