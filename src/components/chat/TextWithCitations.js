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

            <PopoverContent>
                {url ? (
                    <div className="popover-link">
                        <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {title}
                        </a>
                    </div>
                ) : (
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="popover-title"
                    >
                        {title}
                    </div>
                )}
                <p>{strippedContent}</p>
            </PopoverContent>
        </Popover>
    );
}

export default TextWithCitations;
