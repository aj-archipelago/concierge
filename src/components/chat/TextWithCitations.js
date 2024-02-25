import React, { useState, useRef, useContext } from "react";
import { Overlay, Popover } from 'react-bootstrap';
import { LanguageContext } from "../../contexts/LanguageProvider";

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
        <span key={index} ref={target} onClick={() => setShow(!show)} className="text-with-citations">
            <sup>
                {index}
            </sup>
            <Overlay
                show={show}
                target={target.current}
                placement={language === 'ar' ? "right" : "left"}
                containerPadding={20}
                transition={true}
                rootClose
                onHide={() => setShow(false)}
            >
                <Popover id="popover-contained">
                    <Popover.Header>
                    {
                            url ?
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
                            :
                            <div
                                onClick={(e) => e.stopPropagation()}
                                className="popover-title">
                                {title}
                            </div>
                        }
                    </Popover.Header>
                    <Popover.Body>
                        <p>
                            {strippedContent}
                        </p>
                    </Popover.Body>
                </Popover>
            </Overlay>
        </span>
    );
}

export default TextWithCitations;