import { useEffect, useState } from "react";
import { Button } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { MdOutlineContentCopy } from "react-icons/md";

function CopyButton({ item, variant = "default" }) {
    const [copied, setCopied] = useState(false);
    const { t } = useTranslation();

    useEffect(() => {
        if (copied) {
            setTimeout(() => {
                setCopied(false);
            }, 3000);
        }
    }, [copied]);

    return (
        <div className="copy-button-container">
            {copied && (
                <div
                    className={`copy-text ${
                        variant === "opaque" ? "copy-text-opaque" : ""
                    }`}
                >
                    {t("Copied to clipboard")}
                </div>
            )}
            <Button
                className="copy-button"
                variant="link"
                onClick={() => {
                    if (typeof navigator !== "undefined") {
                        navigator?.clipboard.writeText(item);
                        setCopied(true);
                    }
                }}
            >
                <MdOutlineContentCopy />
            </Button>
        </div>
    );
}

export default CopyButton;
