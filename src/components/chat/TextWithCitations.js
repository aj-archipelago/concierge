import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useRef, useState } from "react";
import CopyButton from "../CopyButton";

function TextWithCitations({ index, citation }) {
    const [show, setShow] = useState(false);
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

    return (
        <Popover id="popover-contained">
            <PopoverTrigger>
                <span
                    key={index}
                    ref={target}
                    onClick={() => setShow(!show)}
                    className="text-with-citations"
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
