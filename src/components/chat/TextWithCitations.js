import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Download } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import CopyButton from "../CopyButton";
import { useFilePreview, renderFilePreview } from "./useFilePreview";

function TextWithCitations({ index, citation }) {
    const [open, setOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const target = useRef(null);
    const { title, url, content, path, wireid, source, slugline, date } =
        citation;

    // Check if the citation URL points to a previewable media file
    const fileType = useFilePreview(url, title || url);
    const isMediaCitation =
        url &&
        (fileType.isPdf ||
            fileType.isImage ||
            fileType.isVideo ||
            fileType.isAudio);

    var parser = new DOMParser();
    var dom = parser.parseFromString(content, "text/html");
    var strippedContent = content ? dom?.body?.textContent : "";

    strippedContent = strippedContent.replace(/\[.*?\]/g, "");

    const wireRef = [wireid, source, slugline, path, date]
        .filter(Boolean)
        .join(" ")
        .trim();

    // Handle click outside for portal contexts (text popover only)
    useEffect(() => {
        if (!open) return;

        const handleClickOutside = (event) => {
            // Get the popover content element
            const popoverContent = document.querySelector(
                "[data-radix-popper-content-wrapper]",
            );
            const trigger = target.current;

            if (!popoverContent || !trigger) return;

            // Check if the click target is in a different document context (iframe)
            const targetDocument =
                event.target.ownerDocument || event.target.document;
            const currentDocument = document;

            // If the click is in a different document, close the popover
            if (targetDocument !== currentDocument) {
                setOpen(false);
                return;
            }

            // Check if click is outside the popover content and trigger
            const isClickInsidePopover = popoverContent.contains(event.target);
            const isClickOnTrigger = trigger.contains(event.target);

            if (!isClickInsidePopover && !isClickOnTrigger) {
                setOpen(false);
            }
        };

        // Use capture phase to ensure we catch events before they bubble
        document.addEventListener("mousedown", handleClickOutside, true);
        document.addEventListener("touchstart", handleClickOutside, true);

        // Also listen for clicks in iframes if they exist
        const iframes = document.querySelectorAll("iframe");
        iframes.forEach((iframe) => {
            try {
                if (iframe.contentDocument) {
                    iframe.contentDocument.addEventListener(
                        "mousedown",
                        handleClickOutside,
                        true,
                    );
                    iframe.contentDocument.addEventListener(
                        "touchstart",
                        handleClickOutside,
                        true,
                    );
                }
            } catch (e) {
                // Cross-origin iframe, can't access contentDocument
            }
        });

        return () => {
            document.removeEventListener("mousedown", handleClickOutside, true);
            document.removeEventListener(
                "touchstart",
                handleClickOutside,
                true,
            );

            // Clean up iframe listeners
            iframes.forEach((iframe) => {
                try {
                    if (iframe.contentDocument) {
                        iframe.contentDocument.removeEventListener(
                            "mousedown",
                            handleClickOutside,
                            true,
                        );
                        iframe.contentDocument.removeEventListener(
                            "touchstart",
                            handleClickOutside,
                            true,
                        );
                    }
                } catch (e) {
                    // Cross-origin iframe
                }
            });
        };
    }, [open]);

    // For media citations (PDF, image, video, audio), open a preview dialog
    if (isMediaCitation) {
        const previewClassName = fileType.isPdf
            ? "w-full h-[80vh] rounded-lg border-none"
            : fileType.isVideo
              ? "max-w-full max-h-[80vh] w-auto h-auto rounded-lg"
              : "max-w-full max-h-[80vh] w-auto h-auto object-contain rounded-lg";

        return (
            <>
                <span
                    key={index}
                    ref={target}
                    onClick={() => setIsPreviewOpen(true)}
                    className="text-with-citations cursor-pointer"
                >
                    <sup>{index}</sup>
                </span>
                <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                    <DialogContent className="max-w-[95vw] max-h-[95vh] p-4 sm:p-6 flex items-center justify-center">
                        <DialogTitle className="sr-only">
                            {title || "Document preview"}
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            {title ? `Viewing ${title}` : "Document preview"}
                        </DialogDescription>
                        <div className="w-full flex items-center justify-center relative">
                            {renderFilePreview({
                                src: url,
                                filename: title || url,
                                fileType,
                                className: previewClassName,
                                autoPlay: fileType.isVideo,
                            })}
                            {url && (
                                <button
                                    onClick={() =>
                                        window.open(
                                            url,
                                            "_blank",
                                            "noopener,noreferrer",
                                        )
                                    }
                                    className="absolute top-4 right-4 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 p-2 rounded-lg shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors z-10"
                                    title="Download"
                                    aria-label="Download"
                                >
                                    <Download className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            </>
        );
    }

    // For text citations, use the existing popover
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <span
                    key={index}
                    ref={target}
                    onClick={() => setOpen(!open)}
                    className="text-with-citations cursor-pointer"
                >
                    <sup>{index}</sup>
                </span>
            </PopoverTrigger>

            <PopoverContent className="text-gray-700 bg-white border max-h-96 overflow-auto">
                <div className="relative">
                    <CopyButton
                        item={formatCitationText({
                            title,
                            strippedContent,
                            wireRef,
                        })}
                        className="absolute top-1 end-1"
                    />
                    <div className="font-semibold mb-4 pe-8">
                        {url ? (
                            <div>
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sky-500 hover:text-sky-500 hover:underline citation-link"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {title}
                                </a>
                            </div>
                        ) : (
                            <div onClick={(e) => e.stopPropagation()}>
                                {title}
                            </div>
                        )}
                    </div>
                    {strippedContent && (
                        <pre className="text-sm font-sans text-gray-800 dark:text-gray-200">
                            {strippedContent}
                        </pre>
                    )}
                    {wireRef && (
                        <div className="text-sm italic">
                            <hr className="my-1" />
                            {wireRef}
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

function formatCitationText({ title, strippedContent, wireRef }) {
    const parts = [];
    if (title) parts.push(title);
    if (strippedContent) parts.push(strippedContent);
    if (wireRef) parts.push(wireRef);
    return parts.join("\n\n");
}

export default TextWithCitations;
