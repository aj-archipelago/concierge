import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useRef, useState } from "react";

function TextWithCitations({ index, citation }) {
    const [show, setShow] = useState(false);
    const target = useRef(null);
    const { title, url, content } = citation;

    var parser = new DOMParser();
    var dom = parser.parseFromString(content, "text/html");
    var strippedContent = dom.body.textContent || "";

    strippedContent = strippedContent.replace(/\[.*?\]/g, "");

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
                <div className="font-semibold mb-4">
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
                        <div onClick={(e) => e.stopPropagation()}>{title}</div>
                    )}
                </div>
                <pre className="text-sm font-sans">{strippedContent}</pre>
            </PopoverContent>
        </Popover>
    );
}

export default TextWithCitations;
