import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import classNames from "../../app/utils/class-names";
import { marked } from "marked";

function CopyButton({ item, className = "absolute top-1 end-1 " }) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (copied) {
            setTimeout(() => setCopied(false), 2000);
        }
    }, [copied]);

    const copyFormattedText = async (text) => {
        // If text is undefined or null, use an empty string instead
        const textToCopy = text || "";

        try {
            const html = marked(textToCopy);
            const blob = new Blob([html], { type: "text/html" });
            const clipboardItem = new ClipboardItem({
                "text/html": blob,
                "text/plain": new Blob([textToCopy], { type: "text/plain" }),
            });
            await navigator.clipboard.write([clipboardItem]);
            setCopied(true);
        } catch (err) {
            // Fallback to basic clipboard API if rich text copy fails
            try {
                await navigator.clipboard.writeText(textToCopy);
                setCopied(true);
            } catch (clipboardErr) {
                console.error("Failed to copy text: ", clipboardErr);
            }
        }
    };

    return (
        <button
            className={classNames(className, "text-gray-500")}
            onClick={() => copyFormattedText(item)}
        >
            {copied ? (
                <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
            ) : (
                <Copy className="w-3.5 h-3.5" />
            )}
        </button>
    );
}

export default CopyButton;
