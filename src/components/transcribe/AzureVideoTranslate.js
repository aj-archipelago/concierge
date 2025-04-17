import { LanguagesIcon } from "lucide-react";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { useRunTask } from "../../../app/queries/notifications";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { useNotificationsContext } from "../../contexts/NotificationContext";
import { LOCALES } from "../../utils/constants";

export default function AzureVideoTranslate({ url, onQueued }) {
    const [sourceLocale, setSourceLocale] = useState("en-US");
    const [targetLocale, setTargetLocale] = useState("ar-QA");
    const { t } = useTranslation();
    const { language } = useContext(LanguageContext);
    const { openNotifications } = useNotificationsContext();
    const runTask = useRunTask();

    const handleSubmit = async () => {
        try {
            await runTask.mutateAsync({
                type: "video-translate",
                sourceLocale,
                targetLocale,
                targetLocaleLabel: new Intl.DisplayNames([language], {
                    type: "language",
                }).of(targetLocale),
                url,
                source: "video_page",
            });

            // Open notifications panel
            openNotifications();

            onQueued?.();
        } catch (error) {
            console.error("Error translating video:", error);
            toast.error("Error queuing video translation");
        }
    };

    return (
        <>
            <div className="mt-2 p-2 border-t border-b rounded border-gray-200 pt-4 bg-opacity-90 bg-neutral-100 shadow">
                <div className="flex items-end gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-sm" htmlFor="sourceLocaleSelect">
                            {t("Original")}
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

                    <div className="flex flex-col gap-1">
                        <label className="text-sm" htmlFor="targetLocaleSelect">
                            {t("Translate to")}
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
