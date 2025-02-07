import axios from "axios";
import { LanguagesIcon } from "lucide-react";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { useNotificationsContext } from "../../contexts/NotificationContext";
import { LOCALES } from "../../utils/constants";
import { useNotifications } from "../../../app/queries/notifications";

export default function AzureVideoTranslate({ url, onQueued }) {
    const [sourceLocale, setSourceLocale] = useState("en-US");
    const [targetLocale, setTargetLocale] = useState("ar-QA");
    const { t } = useTranslation();
    const { language } = useContext(LanguageContext);
    const { openNotifications } = useNotificationsContext();
    const { invalidateNotifications } = useNotifications();

    const handleSubmit = async () => {
        try {
            const { data } = await axios.post("/api/azure-video-translate", {
                sourceLocale,
                targetLocale,
                targetLocaleLabel: new Intl.DisplayNames([language], {
                    type: "language",
                }).of(targetLocale),
                url,
            });

            const requestId = data;

            // Invalidate notifications to trigger a refetch
            invalidateNotifications();
            // Open notifications panel
            openNotifications();

            onQueued?.(requestId);
        } catch (error) {
            console.error("Error translating video:", error);
            toast.error("Error queuing video translation");
        }
    };

    return (
        <>
            <div className="mt-2 p-2 border-t border-b rounded border-gray-200 pt-4 bg-opacity-90 bg-neutral-100 shadow">
                <div className="flex items-end gap-3">
                    <div>
                        <label htmlFor="sourceLocaleSelect">
                            {t("Source Locale")}
                        </label>
                        <select
                            id="sourceLocaleSelect"
                            value={sourceLocale}
                            className="lb-select"
                            onChange={(e) => setSourceLocale(e.target.value)}
                        >
                            {LOCALES.map((code) => (
                                <option key={code} value={code}>
                                    {new Intl.DisplayNames([language], {
                                        type: "language",
                                    }).of(code)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="targetLocaleSelect">
                            {t("Target Locale")}
                        </label>
                        <select
                            className="lb-select"
                            id="targetLocaleSelect"
                            value={targetLocale}
                            onChange={(e) => setTargetLocale(e.target.value)}
                        >
                            {LOCALES.map((code) => (
                                <option key={code} value={code}>
                                    {new Intl.DisplayNames([language], {
                                        type: "language",
                                    }).of(code)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="ml-auto"></div>
                </div>
            </div>
            <div>
                <button
                    disabled={!url}
                    className="lb-primary"
                    onClick={handleSubmit}
                >
                    <LanguagesIcon className="w-4 h-4 me-1" />
                    {t("Translate Video")}
                </button>
            </div>
        </>
    );
}
