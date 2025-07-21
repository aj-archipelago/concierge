import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
import classNames from "../../app/utils/class-names";
import { marked } from "marked";

function CopyButton({ item, className = "absolute top-1 end-1 " }) {
    const [copied, setCopied] = useState(false);
    const { t } = useTranslation();

    useEffect(() => {
        if (copied) {
            setTimeout(() => setCopied(false), 3000);
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
            <div className="relative">
                {copied && (
                    <div
                        className={
                            "copy-notification text-xs whitespace-nowrap absolute top-0 end-0 bg-gray-800/90 dark:text-gray-700 text-white px-2 py-1.5 rounded"
                        }
                    >
                        {t("Copied to clipboard")}
                    </div>
                )}
                <Copy />
            </div>
        </button>
    );
}

export default CopyButton;
