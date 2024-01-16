import React, { useState } from "react";

function TextWithCitations({ index, citation }) {
    const [activeCitation, setActiveCitation] = useState(null);

    const handleClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (activeCitation) {
            setActiveCitation(null);
        } else {
            setActiveCitation(citation);
        }
    };

    const handleClose = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setActiveCitation(null);
    };

    const { title, url, content } = citation;

    var parser = new DOMParser();
    var dom = parser.parseFromString(content, "text/html");
    var strippedContent = dom.body.textContent || "";

    strippedContent = strippedContent.replace(/\[.*?\]/g, "");

    return (
        <span key={index}>
            <sup
                onClick={handleClick}
                style={{
                    cursor: "pointer",
                    color: "#009BFF",
                    textDecoration: "underline",
                    margin: "0 1px",
                    fontSize: "0.9em",
                }}
            >
                {index}
            </sup>
            {activeCitation && (
                <div
                    className="citation-text"
                    style={{
                        position: "relative",
                        marginTop: "10px",
                        border: "1px solid #dee2e6",
                        borderRadius: ".25rem",
                        padding: "10px",
                        marginBottom: "10px",
                    }}
                >
                    <div
                        onClick={handleClose}
                        style={{
                            position: "absolute",
                            right: "10px",
                            top: "5px",
                            cursor: "pointer",
                            fontSize: "1.2em",
                        }}
                    >
                        x
                    </div>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            marginBottom: "10px",
                        }}
                    >
                        <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                                color: "#007BFF",
                                textDecoration: "underline",
                            }}
                        >
                            {title}
                        </a>
                    </div>
                    <div style={{ fontSize: "0.8rem", lineHeight: "1.2" }}>
                        {strippedContent}
                    </div>
                </div>
            )}
        </span>
    );
}

export default TextWithCitations;
