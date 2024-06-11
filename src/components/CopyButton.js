import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MdOutlineContentCopy } from "react-icons/md";
import classNames from "../../app/utils/class-names";

function CopyButton({ item, className = "absolute top-1 end-1 " }) {
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
        <button
            className={classNames(className, "text-gray-300")}
            onClick={() => {
                if (typeof navigator !== "undefined") {
                    navigator?.clipboard.writeText(item);
                    setCopied(true);
                }
            }}
        >
            <div className="relative">
                {copied && (
                    <div
                        className={
                            "text-xs whitespace-nowrap absolute top-0 end-0 bg-gray-800/90 dark:bg-gray-100/90 text-white p-1 rounded"
                        }
                    >
                        {t("Copied to clipboard")}
                    </div>
                )}
                <MdOutlineContentCopy />
            </div>
        </button>
    );
}

export default CopyButton;
