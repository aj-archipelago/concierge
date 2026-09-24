import React, { useContext } from "react";
import { useTranslation } from "react-i18next";
import { LanguageContext } from "../../contexts/LanguageProvider";

export default function ChatStreamNotice({ message }) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    let status;
    try {
        status = JSON.parse(message?.tool || "{}").streamStatus;
    } catch {
        return null;
    }
    if (status !== "interrupted" && status !== "save_failed") return null;

    return (
        <p
            role="status"
            dir={direction}
            className="mb-2 text-sm break-words text-amber-800 dark:text-amber-200"
        >
            {t(
                status === "save_failed"
                    ? "Chat reply could not be saved"
                    : "Chat reply was interrupted",
            )}
        </p>
    );
}
