"use client";

import * as amplitude from "@amplitude/analytics-browser";
import { useApolloClient } from "@apollo/client";
import React, {
    useCallback,
    useContext,
    useMemo,
    useState,
    useRef,
} from "react";
import { useTranslation } from "react-i18next";
import "react-quill/dist/quill.snow.css";
import { useDispatch } from "react-redux";
import { AuthContext } from "../../App";
import { indexMainPaneText } from "../../utils/indexMainPaneText";
import { stripHTML, getDOMPurifyConfig } from "../../utils/html.utils";
import AIModal from "../AIModal";
import { Upload, X, Plus, ChevronDown, Languages, Check } from "lucide-react";
import actions from "../editor/AIEditorActions";
import HeadlineEditor from "../editor/headline/HeadlineEditor";
import Editor from "./Editor";
import Toolbar from "./Toolbar";
import FeaturedImageDialog from "./FeaturedImageDialog";
import { useSidebarItems } from "./sidebar/useSidebarItems";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DOMPurify from "dompurify";
import { getDownloadUrl } from "../../utils/fileDownloadUtils";

/**
 * Component to render preview content with HTML widgets.
 *
 * SECURITY NOTE: This component sanitizes HTML content using DOMPurify before rendering
 * to prevent XSS attacks. The content is expected to come from trusted sources (user's own
 * article content), but sanitization provides defense-in-depth. Raw HTML widgets are
 * rendered in sandboxed iframes for additional isolation.
 */
function PreviewContent({ content }) {
    const containerRef = React.useRef(null);
    const messageHandlersRef = React.useRef([]);

    React.useEffect(() => {
        if (!containerRef.current || !content) return;

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
                    const urlMatch = style.match(/url\(['"]?([^'"]+)['"]?\)/);
                    const bgProxiedUrl = urlMatch?.[1]
                        ? getDownloadUrl(urlMatch[1])
                        : null;
                    if (bgProxiedUrl && bgProxiedUrl !== urlMatch[1]) {
                        const proxiedUrl = bgProxiedUrl;
                        el.setAttribute(
                            "style",
                            style.replace(urlMatch[0], `url('${proxiedUrl}')`),
                        );
                    }
                }
            });

            return tempDiv.innerHTML;
        };

        // Clear previous message handlers
        messageHandlersRef.current.forEach((handler) => {
            window.removeEventListener("message", handler);
        });
        messageHandlersRef.current = [];

        // Sanitize HTML content before rendering to prevent XSS attacks.
        // Configure DOMPurify to allow data-* attributes needed for raw HTML widgets.
        const sanitizedContent = DOMPurify.sanitize(
            content,
            getDOMPurifyConfig({ allowDataAttr: true }),
        );

        // Set sanitized HTML content
        containerRef.current.innerHTML = sanitizedContent;

        // Attach an error handler to every inline <img> so failed loads hide
        // the image instead of showing the browser's broken-image icon.
        // Skip widget iframes (they handle their own image errors below) by
        // only targeting <img> tags directly inside the article body.
        const inlineImages = Array.from(
            containerRef.current.querySelectorAll("img"),
        );
        inlineImages.forEach((img) => {
            img.addEventListener("error", () => {
                // Hide the parent figure if there is one; otherwise hide the img.
                const figure = img.closest("figure");
                if (figure) {
                    figure.style.display = "none";
                } else {
                    img.style.display = "none";
                }
            });
        });

        // Find all raw HTML widget divs in the actual DOM
        const widgetDivs = Array.from(
            containerRef.current.querySelectorAll('div[data-type="raw-html"]'),
        );

        // Replace each widget div with an iframe directly in the DOM
        widgetDivs.forEach((widgetDiv) => {
            const htmlContent = widgetDiv.getAttribute("data-html") || "";
            const processedHtml = processHtmlForImages(htmlContent);

            // Generate a unique identifier for this iframe instance
            const iframeId = `preview-widget-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

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
        html, body {
            width: 100%;
            min-height: 100%;
        }
    </style>
</head>
<body>
    ${processedHtml}
    <script>
        function resizeIframe() {
            // Use requestAnimationFrame to ensure DOM is fully updated
            requestAnimationFrame(() => {
                const height = Math.max(
                    document.body.scrollHeight,
                    document.body.offsetHeight,
                    document.documentElement.clientHeight,
                    document.documentElement.scrollHeight,
                    document.documentElement.offsetHeight
                );
                // Add a small buffer to ensure content isn't cut off
                const finalHeight = Math.ceil(height) + 2;
                if (window.parent !== window) {
                    window.parent.postMessage({
                        type: 'resize-iframe',
                        height: finalHeight,
                        iframeId: '${iframeId}'
                    }, '*');
                }
            });
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
                    const originalSrc = img.getAttribute('data-original-src');
                    if (originalSrc && img.src.includes('/api/image-proxy')) {
                        console.warn('Proxied image failed, trying original URL:', originalSrc);
                        img.src = originalSrc;
                    }
                    resizeIframe();
                });
            }
        });
        const observer = new MutationObserver(() => {
            // Debounce resize calls
            clearTimeout(window.resizeTimeout);
            window.resizeTimeout = setTimeout(resizeIframe, 50);
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true
        });
        // Also resize after fonts load
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(resizeIframe);
        }
    </script>
</body>
</html>`;

            // Create iframe wrapper
            const wrapper = document.createElement("div");
            wrapper.className = "raw-html-wrapper";
            wrapper.style.margin = "1rem 0";
            wrapper.style.overflow = "visible"; // Ensure wrapper doesn't clip content

            // Create iframe
            const iframe = document.createElement("iframe");
            iframe.className = "raw-html-content";
            iframe.setAttribute("sandbox", "allow-scripts");
            iframe.setAttribute("scrolling", "no");
            iframe.style.border = "none";
            iframe.style.width = "100%";
            iframe.style.minHeight = "100px";
            iframe.style.display = "block";
            iframe.style.overflow = "hidden"; // Prevent scrollbars
            iframe.srcdoc = completeHtml;

            // Handle resize messages
            const handleMessage = (event) => {
                if (
                    event.data &&
                    event.data.type === "resize-iframe" &&
                    event.data.iframeId === iframeId
                ) {
                    // Ensure height is at least the minimum
                    const newHeight = Math.max(event.data.height || 100, 100);
                    iframe.style.height = newHeight + "px";
                }
            };
            window.addEventListener("message", handleMessage);
            messageHandlersRef.current.push(handleMessage);

            // Set initial height and ensure resize happens after load
            iframe.onload = () => {
                // Set a reasonable initial height, will be updated by postMessage
                iframe.style.height = "200px";
                // Request resize after a short delay to ensure content is rendered
                setTimeout(() => {
                    // The iframe will automatically send resize message when ready
                }, 200);
            };

            wrapper.appendChild(iframe);
            widgetDiv.parentNode.replaceChild(wrapper, widgetDiv);
        });

        // Cleanup function
        return () => {
            messageHandlersRef.current.forEach((handler) => {
                window.removeEventListener("message", handler);
            });
            messageHandlersRef.current = [];
        };
    }, [content]);

    return (
        <div
            ref={containerRef}
            className="article-content prose prose-lg dark:prose-invert max-w-none"
            style={{
                fontFamily: "Georgia, serif",
                fontSize: "18px",
                lineHeight: "1.8",
            }}
        />
    );
}

function Write({ articleEditor, isActive }) {
    const { user } = useContext(AuthContext);
    const contextId = user?.contextId;
    const dispatch = useDispatch();
    const [selection, setSelection] = useState(null);
    const [showFeaturedImageDialog, setShowFeaturedImageDialog] =
        useState(false);
    const [activeTab, setActiveTab] = useState("editor");
    // Editor direction mode: 'ltr' for English, 'rtl' for Arabic
    const [editorDirection, setEditorDirection] = useState("ltr");
    const client = useApolloClient();

    // Get state from articleEditor hook
    const {
        headline,
        subhead,
        content: inputText,
        featuredImageUrl,
        fileHash: currentFileHash,
    } = articleEditor.state;

    const { updateContent } = articleEditor.operations;

    // The action is the AI action that the user has selected.
    // It triggers the AI modal.
    const [action, setAction] = useState(null);
    const [args, setArgs] = useState(null);
    const { t } = useTranslation();

    const editorInstanceRef = useRef(null);

    // If the action is a selection, then we want to pass the selected text
    // to the AI modal. Otherwise, we want to pass the entire text.
    // Extract plain text from HTML for the modal
    const modalInputText =
        actions[action]?.type === "selection"
            ? selection.text
            : inputText
              ? stripHTML(inputText)
              : "";

    const onHideCallback = useCallback(() => setAction(null), [setAction]);
    const onCommitCallback = useCallback(
        (t) => {
            // If the action is a selection, then we want to update the selected text
            // with the new text. Otherwise, we want to replace the entire text.
            // Since the editor now uses HTML, we need to handle this properly.
            const getUpdatedText = (text) => {
                if (!text || !text.trim()) {
                    return "";
                }

                // For grammar, styleguide, and legacy_styleguide actions, the text is already HTML (from apply-corrections-to-html endpoint)
                // Use it directly without conversion
                const isHtmlAction =
                    action === "grammar" ||
                    action === "styleguide" ||
                    action === "legacy_styleguide";
                if (isHtmlAction) {
                    // Check if text contains HTML tags (simple heuristic)
                    const hasHtmlTags = /<[^>]+>/g.test(text);
                    console.log("onCommitCallback: HTML action detected", {
                        action,
                        textLength: text.length,
                        textPreview: `${text.substring(0, 100)}...`,
                        hasHtmlTags,
                    });
                    // For HTML actions, use the text directly (it's already HTML from the API)
                    return text;
                }

                if (actions[action]?.type === "selection") {
                    // For selection replacement, convert HTML to plain text,
                    // do the replacement, then convert back to HTML
                    const plainText = stripHTML(inputText);
                    const { start, end } = selection;
                    const before = plainText.substring(0, start);
                    const after = plainText.substring(end);
                    const newPlainText = before + text + after;

                    // Convert plain text to HTML paragraphs
                    // Split by double newlines for paragraphs, single newlines for line breaks
                    const paragraphs = newPlainText
                        .split(/\n\n+/)
                        .filter((p) => p.trim());
                    if (paragraphs.length === 0) return "";
                    return paragraphs
                        .map((p) => `<p>${p.trim().replace(/\n/g, "<br>")}</p>`)
                        .join("");
                } else {
                    // For full replacement, convert plain text to HTML paragraphs
                    const paragraphs = text
                        .split(/\n\n+/)
                        .filter((p) => p.trim());
                    if (paragraphs.length === 0) return "";
                    return paragraphs
                        .map((p) => `<p>${p.trim().replace(/\n/g, "<br>")}</p>`)
                        .join("");
                }
            };

            const updatedText = getUpdatedText(t);
            updateContent({ content: updatedText });
            // Extract plain text for indexing
            const plainTextForIndexing = stripHTML(updatedText);
            indexMainPaneText(
                plainTextForIndexing,
                contextId,
                dispatch,
                client,
            );
        },
        [
            dispatch,
            action,
            inputText,
            selection,
            contextId,
            client,
            updateContent,
        ],
    );

    const handleEditorSelect = React.useCallback(
        (selection) => {
            setSelection(selection);
        },
        [setSelection],
    );

    const handleEditorChange = React.useCallback(
        (text) => {
            updateContent({ content: text });
            // Extract plain text from HTML for indexing
            const plainText = stripHTML(text);
            indexMainPaneText(plainText, contextId, dispatch, client);
        },
        [dispatch, contextId, client, updateContent],
    );

    const handleImageGenerated = React.useCallback(
        (url) => {
            console.log("handleImageGenerated called with URL:", url);
            updateContent({ featuredImageUrl: url });
        },
        [updateContent],
    );

    // Use sidebar items hook
    const { sidebarItems, openDialogForItem, dialogs } = useSidebarItems(
        inputText,
        (a, args) => {
            setAction(a);
            setArgs(args);
        },
    );

    const editorPane = useMemo(() => {
        return (
            <>
                <div className="grow md:basis-full flex flex-col min-h-0">
                    {/* Tabs below the header */}
                    <Tabs
                        value={activeTab}
                        onValueChange={setActiveTab}
                        className="flex flex-col flex-1 min-h-0"
                    >
                        <div className="mb-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                            <TabsList className="bg-transparent h-auto p-0 gap-0 w-fit">
                                <TabsTrigger
                                    value="editor"
                                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-sky-600 dark:data-[state=active]:border-sky-400 rounded-none px-4 py-2 border-b-2 border-transparent"
                                >
                                    {t("Editor")}
                                </TabsTrigger>
                                <TabsTrigger
                                    value="preview"
                                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-sky-600 dark:data-[state=active]:border-sky-400 rounded-none px-4 py-2 border-b-2 border-transparent"
                                >
                                    {t("Preview")}
                                </TabsTrigger>
                            </TabsList>
                            {/* Editor direction selector */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="flex items-center gap-2 h-8"
                                    >
                                        <Languages className="w-4 h-4" />
                                        {editorDirection === "rtl"
                                            ? t("Arabic")
                                            : t("English")}
                                        <ChevronDown className="w-3 h-3" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="end"
                                    className="w-40"
                                >
                                    <DropdownMenuItem
                                        onClick={() => {
                                            setEditorDirection("ltr");
                                            // Editor direction is managed locally, no persistence
                                        }}
                                        className="flex items-center gap-2"
                                    >
                                        {editorDirection === "ltr" && (
                                            <Check className="w-4 h-4" />
                                        )}
                                        {editorDirection !== "ltr" && (
                                            <div className="w-4 h-4" />
                                        )}
                                        {t("English")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => {
                                            setEditorDirection("rtl");
                                            // Editor direction is managed locally, no persistence
                                        }}
                                        className="flex items-center gap-2"
                                    >
                                        {editorDirection === "rtl" && (
                                            <Check className="w-4 h-4" />
                                        )}
                                        {editorDirection !== "rtl" && (
                                            <div className="w-4 h-4" />
                                        )}
                                        {t("Arabic")}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {/* Editor Tab */}
                        <TabsContent
                            value="editor"
                            className="flex-1 min-h-0 overflow-auto"
                        >
                            <div
                                className={`max-w-4xl mx-auto w-full flex flex-col ${editorDirection === "rtl" ? "rtl" : ""}`}
                                dir={editorDirection}
                            >
                                <div className="mb-4">
                                    <HeadlineEditor
                                        headline={headline}
                                        subhead={subhead}
                                        onChange={(h) => {
                                            updateContent({
                                                headline: h.headline,
                                                subhead: h.subhead,
                                            });
                                            // UserState persistence removed
                                        }}
                                        articleText={inputText}
                                    />
                                </div>
                                {/* Featured Image */}
                                <div className="mb-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                                    {featuredImageUrl ? (
                                        <div className="relative group">
                                            <img
                                                src={featuredImageUrl}
                                                alt="Featured"
                                                className="w-full h-auto max-h-96 object-cover rounded-md"
                                                onError={(e) => {
                                                    // Replace failed featured image with a graceful placeholder
                                                    // instead of the browser's broken-image icon.
                                                    const img = e.currentTarget;
                                                    img.style.display = "none";
                                                    const fallback =
                                                        img.nextElementSibling;
                                                    if (
                                                        fallback &&
                                                        fallback.dataset
                                                            ?.role ===
                                                            "featured-image-fallback"
                                                    ) {
                                                        fallback.style.display =
                                                            "flex";
                                                    }
                                                }}
                                            />
                                            <div
                                                data-role="featured-image-fallback"
                                                className="hidden items-center justify-center w-full h-32 rounded-md bg-gray-100 dark:bg-gray-700 text-sm text-gray-500 dark:text-gray-400"
                                            >
                                                {t(
                                                    "Featured image unavailable",
                                                )}
                                            </div>
                                            <div className="absolute top-2 end-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() =>
                                                        setShowFeaturedImageDialog(
                                                            true,
                                                        )
                                                    }
                                                    className="bg-white dark:bg-gray-800 p-2 rounded-md shadow-md hover:bg-gray-50 dark:hover:bg-gray-700"
                                                >
                                                    <Upload className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        updateContent({
                                                            featuredImageUrl:
                                                                "",
                                                        });
                                                        // UserState persistence removed
                                                    }}
                                                    className="bg-white dark:bg-gray-800 p-2 rounded-md shadow-md hover:bg-gray-50 dark:hover:bg-gray-700"
                                                >
                                                    <X className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 p-2">
                                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                {t("Featured Image")}
                                            </label>
                                            <button
                                                onClick={() =>
                                                    setShowFeaturedImageDialog(
                                                        true,
                                                    )
                                                }
                                                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                                aria-label={t(
                                                    "Add featured image",
                                                )}
                                            >
                                                <Plus className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="mb-6">
                                    <Toolbar
                                        actions={actions}
                                        onAction={(a, args) => {
                                            amplitude.track("Modal Opened", {
                                                type: a,
                                            });
                                            setAction(a);
                                            setArgs(args);
                                            if (actions[a].postApply) {
                                                switch (actions[a].postApply) {
                                                    case "clear-headline":
                                                        updateContent({
                                                            headline: "",
                                                            subhead: "",
                                                        });
                                                        // UserState persistence removed
                                                        break;
                                                    default:
                                                        break;
                                                }
                                            }
                                        }}
                                        isTextPresent={!!inputText}
                                        isTextSelected={!!selection?.text}
                                        inputText={inputText}
                                        sidebarItems={sidebarItems}
                                        onSidebarItemClick={openDialogForItem}
                                    />
                                </div>
                                <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                                    <Editor
                                        value={inputText}
                                        onSelect={handleEditorSelect}
                                        onChange={handleEditorChange}
                                        onEditorReady={(editor) => {
                                            editorInstanceRef.current = editor;
                                        }}
                                        contextId={contextId}
                                        direction={editorDirection}
                                        isActive={isActive}
                                        fileHash={currentFileHash}
                                    ></Editor>
                                </div>
                            </div>
                        </TabsContent>

                        {/* Preview Tab */}
                        <TabsContent
                            value="preview"
                            className="flex-1 min-h-0 overflow-auto"
                        >
                            <div
                                className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 ${editorDirection === "rtl" ? "rtl" : ""}`}
                                dir={editorDirection}
                            >
                                <article className="max-w-3xl mx-auto">
                                    <header className="mb-6">
                                        {/* Headline */}
                                        {headline && (
                                            <h1
                                                className="text-2xl md:text-3xl leading-tight text-gray-900 dark:text-gray-100 mb-2"
                                                style={{
                                                    fontFamily:
                                                        "Roboto, sans-serif",
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {headline}
                                            </h1>
                                        )}

                                        {/* Subhead */}
                                        {subhead && (
                                            <p
                                                className="text-base md:text-lg leading-snug text-gray-600 dark:text-gray-300"
                                                style={{
                                                    fontFamily:
                                                        "Georgia, serif",
                                                    fontStyle: "italic",
                                                }}
                                            >
                                                {subhead}
                                            </p>
                                        )}
                                    </header>

                                    {/* Featured Image */}
                                    {featuredImageUrl && (
                                        <figure className="mb-6">
                                            <img
                                                src={featuredImageUrl}
                                                alt="Featured"
                                                className="w-full h-auto max-h-96 object-cover rounded-md shadow-md"
                                                onError={(e) => {
                                                    // Hide the figure entirely so a broken
                                                    // featured image doesn't push article
                                                    // content down with a broken-image icon.
                                                    const figure =
                                                        e.currentTarget.closest(
                                                            "figure",
                                                        );
                                                    if (figure) {
                                                        figure.style.display =
                                                            "none";
                                                    }
                                                }}
                                            />
                                        </figure>
                                    )}

                                    {/* Content */}
                                    {inputText ? (
                                        <PreviewContent content={inputText} />
                                    ) : (
                                        <p className="text-gray-400 dark:text-gray-500 italic">
                                            {t("No content to preview")}
                                        </p>
                                    )}
                                </article>
                            </div>
                            <style>{`
                                .article-content h1,
                                .article-content h2,
                                .article-content h3 {
                                    font-family: 'Roboto', sans-serif !important;
                                    font-weight: 700;
                                }
                                .article-content h1 {
                                    font-size: 2.25rem;
                                    line-height: 1.2;
                                    margin: 2.25rem 0 1rem 0;
                                }
                                .article-content h2 {
                                    font-size: 1.875rem;
                                    line-height: 1.3;
                                    margin: 2rem 0 1rem 0;
                                }
                                .article-content h3 {
                                    font-size: 1.5rem;
                                    line-height: 1.4;
                                    margin: 1.75rem 0 0.875rem 0;
                                }
                            `}</style>
                        </TabsContent>
                    </Tabs>
                </div>
                <AIModal
                    show={!!action}
                    onHide={onHideCallback}
                    action={action}
                    args={args}
                    inputText={modalInputText}
                    inputHtml={
                        action === "styleguide" ||
                        action === "grammar" ||
                        action === "legacy_styleguide"
                            ? inputText
                            : undefined
                    } // Pass HTML for styleguide, grammar, and legacy_styleguide actions
                    onCommit={onCommitCallback}
                />
                <FeaturedImageDialog
                    show={showFeaturedImageDialog}
                    onHide={() => setShowFeaturedImageDialog(false)}
                    onImageSelected={handleImageGenerated}
                    contextId={contextId}
                    direction={editorDirection}
                />
                {dialogs}
            </>
        );
    }, [
        headline,
        subhead,
        inputText,
        featuredImageUrl,
        currentFileHash,
        selection?.text,
        handleEditorSelect,
        handleEditorChange,
        action,
        onHideCallback,
        args,
        modalInputText,
        onCommitCallback,
        contextId,
        isActive,
        t,
        showFeaturedImageDialog,
        setShowFeaturedImageDialog,
        handleImageGenerated,
        sidebarItems,
        openDialogForItem,
        dialogs,
        activeTab,
        editorDirection,
        updateContent,
    ]);

    return (
        <div
            className={`flex gap-6 h-full min-h-0 overflow-hidden ${editorDirection === "rtl" ? "rtl" : ""}`}
            dir={editorDirection}
        >
            {editorPane}
        </div>
    );
}

export default Write;
