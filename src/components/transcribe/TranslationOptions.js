import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Languages } from "lucide-react";
import dayjs from "dayjs";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRunTask } from "../../../app/queries/notifications";
import { useNotificationsContext } from "../../contexts/NotificationContext";
import LoadingButton from "../editor/LoadingButton";

function TranslationOptions({
    transcripts = [],
    onAdd,
    onClose,
    activeTranscript,
    async = true,
}) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [
        transcriptionTranslationLanguage,
        setTranscriptionTranslationLanguage,
    ] = useState("Arabic");
    const [selectedTranscript, setSelectedTranscript] = useState(
        transcripts[activeTranscript],
    );
    const { openNotifications } = useNotificationsContext();
    const runTask = useRunTask();

    const fetchTranslate = useCallback(
        async (text, language) => {
            try {
                setLoading(true);

                const taskData = {
                    type: "subtitle-translate",
                    text,
                    to: language,
                    format: selectedTranscript?.format,
                    name: t("{{name}}: {{language}} Translation", {
                        name: selectedTranscript?.name,
                        language: transcriptionTranslationLanguage,
                    }),
                    source: "video_page",
                };

                const data = await runTask.mutateAsync(taskData);

                if (data.taskId) {
                    // Open notifications panel to show progress
                    openNotifications();

                    // Close the dialog since the job is now queued
                    onClose?.();
                }
            } catch (e) {
                console.error("Translation error:", e);
            } finally {
                setLoading(false);
            }
        },
        [
            selectedTranscript,
            transcriptionTranslationLanguage,
            t,
            onClose,
            openNotifications,
            runTask,
        ],
    );

    return (
        <div>
            <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="mb-3 basis-2/3">
                    <h3 className="text-sm mb-1">{t("From")}</h3>
                    <Select
                        value={selectedTranscript?.name || ""}
                        onValueChange={(value) => {
                            setSelectedTranscript(transcripts[parseInt(value)]);
                        }}
                    >
                        <SelectTrigger className="w-full justify-between text-left">
                            {selectedTranscript ? (
                                <div className="flex flex-col text-sm max-w-[250px]">
                                    <div
                                        className="truncate overflow-ellipsis whitespace-nowrap"
                                        title={selectedTranscript?.name}
                                    >
                                        {selectedTranscript?.name}
                                    </div>
                                    <div className="text-xs text-gray-400 truncate overflow-ellipsis whitespace-nowrap">
                                        {dayjs(
                                            selectedTranscript?.timestamp,
                                        ).format("MMM DD, YYYY HH:mm:ss")}
                                    </div>
                                </div>
                            ) : (
                                <SelectValue
                                    placeholder={t("Select transcript")}
                                />
                            )}
                        </SelectTrigger>
                        <SelectContent>
                            {transcripts.map((transcript, index) => (
                                <SelectItem
                                    key={transcript.name}
                                    value={index.toString()}
                                >
                                    <div className="flex flex-col max-w-[250px]">
                                        <div
                                            className="truncate overflow-ellipsis whitespace-nowrap"
                                            title={transcript.name}
                                        >
                                            {transcript.name}
                                        </div>
                                        {transcript.timestamp && (
                                            <div className="text-xs text-gray-400">
                                                {dayjs(
                                                    transcript.timestamp,
                                                ).format(
                                                    "MMM DD, YYYY HH:mm:ss",
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="mb-3 basis-1/3">
                    <h3 className="text-sm mb-1">{t("To")}</h3>
                    <select
                        className="lb-select"
                        disabled={loading}
                        onChange={(event) =>
                            setTranscriptionTranslationLanguage(
                                event.target.value,
                            )
                        }
                        value={transcriptionTranslationLanguage}
                    >
                        <option value={t("Arabic")}>{t("Arabic")}</option>
                        <option value={t("English (UK)")}>
                            {t("English (UK)")}
                        </option>
                        <option value={t("English (US)")}>
                            {t("English (US)")}
                        </option>
                        <option value={t("French")}>{t("French")}</option>
                        <option value={t("Spanish")}>{t("Spanish")}</option>
                        <option value={t("German")}>{t("German")}</option>
                        <option value={t("Hebrew")}>{t("Hebrew")}</option>
                        <option value={t("Italian")}>{t("Italian")}</option>
                        <option value={t("Portuguese")}>
                            {t("Portuguese")}
                        </option>
                        <option value={t("Chinese")}>{t("Chinese")}</option>
                        <option value={t("Japanese")}>{t("Japanese")}</option>
                        <option value={t("Korean")}>{t("Korean")}</option>
                        <option value={t("Bosnian")}>{t("Bosnian")}</option>
                        <option value={t("Croatian")}>{t("Croatian")}</option>
                        <option value={t("Serbian")}>{t("Serbian")}</option>
                        <option value={t("Russian")}>{t("Russian")}</option>
                        <option value={t("Turkish")}>{t("Turkish")}</option>
                    </select>
                </div>
            </div>

            <LoadingButton
                className="lb-primary"
                loading={loading}
                onClick={() => {
                    fetchTranslate(
                        selectedTranscript?.text,
                        transcriptionTranslationLanguage,
                    );
                }}
                text={t("Translating...")}
            >
                <Languages className="h-4 w-4" /> {t("Translate")}
            </LoadingButton>
        </div>
    );
}

export default TranslationOptions;
