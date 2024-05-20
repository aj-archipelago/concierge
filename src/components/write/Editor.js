"use client";

import { useEffect, useRef, useState } from "react";
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

    return (
        <div className="relative grow ">
            {value && <CopyButton item={value} variant="opaque" />}
            <textarea
                ref={textAreaRef}
                className="w-full px-1 py-1 focus:ring-offset-2 focus:ring-sky-400 h-full border-0 font-serif resize-none
                placeholder-gray-400"
                placeholder={t("Enter story content")}
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
}

export default Editor;
