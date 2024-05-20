import React, { useState, useRef, useContext } from "react";
import { LanguageContext } from "../../contexts/LanguageProvider";
import {
    PopoverTrigger,
    Popover,
    PopoverContent,
} from "@/components/ui/popover";

function TextWithCitations({ index, citation }) {
    const [show, setShow] = useState(false);
    const target = useRef(null);
    const { language } = useContext(LanguageContext);

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
                ></span>
            </PopoverTrigger>

            <PopoverContent>
                <sup>{index}</sup>

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
