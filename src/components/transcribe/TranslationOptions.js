import { useApolloClient } from "@apollo/client";
import { LanguageIcon } from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { QUERIES } from "../../graphql";
import LoadingButton from "../editor/LoadingButton";
import { useProgress } from "../../contexts/ProgressContext";
import dayjs from "dayjs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

function TranslationOptions({
    transcripts = [],
    onAdd,
    onClose,
    activeTranscript,
    async = true,
}) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const apolloClient = useApolloClient();
    const [
        transcriptionTranslationLanguage,
        setTranscriptionTranslationLanguage,
    ] = useState("Arabic");
    const [requestId, setRequestId] = useState(null);
    const [selectedTranscript, setSelectedTranscript] = useState(
        transcripts[activeTranscript],
    );
    const { addProgressToast } = useProgress();

    const fetchTranslate = useCallback(
        async (text, language) => {
            try {
                setLoading(true);
                const { data } = await apolloClient.query({
                    query: QUERIES.TRANSLATE_SUBTITLE,
                    variables: {
                        text,
                        to: language,
                        async,
                        format: selectedTranscript?.format,
                    },
                    fetchPolicy: "network-only",
                });
                const result =
                    data?.translate_subtitle?.result ||
                    data?.translate_gpt4?.result;

                if (result) {
                    if (async) {
                        setRequestId(result);
                        addProgressToast(
                            result,
                            t("Translating") +
                                " " +
                                selectedTranscript?.name +
                                " " +
                                t("to") +
                                " " +
                                transcriptionTranslationLanguage +
                                "...",
                            async (finalData) => {
                                setLoading(false);
                                setFinalData(finalData);
                            },
                        );
                        onClose();
                    } else {
                        setFinalData(result);
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            apolloClient,
            async,
            addProgressToast,
            t,
            onClose,
            transcriptionTranslationLanguage,
            selectedTranscript,
        ],
    );

    const setFinalData = (finalData) => {
        onAdd({
            text: finalData,
            name: t("{{name}}: {{language}} Translation", {
                name: selectedTranscript?.name,
                language: transcriptionTranslationLanguage,
            }),
            format: selectedTranscript?.format,
        });
        setRequestId(null);
    };

    return (
        <div>
            <div className="flex items-center gap-2">
                <div className="mb-3 basis-1/2">
                    <h3 className="text-sm mb-1">{t("From")}</h3>
                    <Select
                        value={selectedTranscript?.name || ""}
                        onValueChange={(value) => {
                            setSelectedTranscript(transcripts[parseInt(value)]);
                        }}
                    >
                        <SelectTrigger className="">
                            {selectedTranscript ? (
                                <div className="flex flex-col text-start text-sm">
                                    {selectedTranscript?.name}
                                    <div className="text-xs text-gray-400">
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
                                    <div className="flex flex-col">
                                        <div>{transcript.name}</div>
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
                <div className="mb-3 basis-1/2">
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
                loading={loading || requestId}
                onClick={() => {
                    fetchTranslate(
                        selectedTranscript?.text,
                        transcriptionTranslationLanguage,
                    );
                }}
                text={t("Translating...")}
            >
                <LanguageIcon className="h-4 w-4" /> {t("Translate")}
            </LoadingButton>
        </div>
    );
}

export default TranslationOptions;
