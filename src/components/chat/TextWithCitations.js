import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useRef, useState, useEffect } from "react";
import CopyButton from "../CopyButton";

function TextWithCitations({ index, citation }) {
    const [open, setOpen] = useState(false);
    const target = useRef(null);
    const { title, url, content, path, wireid, source, slugline, date } =
        citation;

    var parser = new DOMParser();
    var dom = parser.parseFromString(content, "text/html");
    var strippedContent = content ? dom?.body?.textContent : "";

    strippedContent = strippedContent.replace(/\[.*?\]/g, "");

    const wireRef = [wireid, source, slugline, path, date]
        .filter(Boolean)
        .join(" ")
        .trim();

    // Handle click outside for portal contexts
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
                                    className="text-sky-500 hover:text-sky-500 hover:underline"
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
                        <pre className="text-sm font-sans">
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
