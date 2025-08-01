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
        <div className="relative grow h-full">
            {value && (
                <CopyButton
                    item={value}
                    className="absolute top-3 end-4 z-10"
                />
            )}
            <textarea
                ref={textAreaRef}
                className="w-full px-4 py-3 focus:ring-2 focus:ring-sky-400 focus:border-sky-400 dark:focus:ring-sky-500 dark:focus:border-sky-500 h-full border border-gray-300 dark:border-gray-600 rounded-md font-serif resize-none placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-colors duration-200"
                placeholder={t("Enter story content")}
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
}

export default Editor;
