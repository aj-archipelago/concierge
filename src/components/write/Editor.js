"use client";

import { useEffect, useRef, useState } from "react";
import { Form } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import CopyButton from "../CopyButton";

function Editor({ value, onChange, onSelect }) {
    const textAreaRef = useRef(null);
    const { t } = useTranslation();

    const [lastSelection, setLastSelection] = useState({
        start: 0,
        end: 0,
        text: "",
    });

    useEffect(() => {
        const handleSelection = () => {
            const newSelection = {
                start: textAreaRef.current.selectionStart,
                end: textAreaRef.current.selectionEnd,
                text: textAreaRef.current.value.substring(
                    textAreaRef.current.selectionStart,
                    textAreaRef.current.selectionEnd,
                ),
            };

            // Check if the selection has actually changed
            if (
                newSelection.start !== lastSelection.start ||
                newSelection.end !== lastSelection.end
            ) {
                onSelect(newSelection);
                setLastSelection(newSelection);
            }
        };

        document.addEventListener("selectionchange", handleSelection);

        return () => {
            document.removeEventListener("selectionchange", handleSelection);
        };
    }, [onSelect, lastSelection]);

    // return <ReactQuill value={value} onChange={onChange} />;
    return (
        <div style={{ position: "relative", flexGrow: 1 }}>
            {value && <CopyButton item={value} variant="opaque" />}
            <Form.Control
                style={{ height: "100%" }}
                ref={textAreaRef}
                className="story-input"
                placeholder={t("Enter story content")}
                as="textarea"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
}

export default Editor;
