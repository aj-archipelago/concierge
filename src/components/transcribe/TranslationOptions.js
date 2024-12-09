import { useApolloClient } from "@apollo/client";
import { LanguageIcon } from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { QUERIES } from "../../graphql";
import LoadingButton from "../editor/LoadingButton";
import { useProgress } from "../../contexts/ProgressContext";

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
                            (finalData) => {
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
        console.log(
            "finalData selectedTranscript",
            finalData,
            selectedTranscript,
        );
        onAdd({
            text: finalData,
            name: `${transcriptionTranslationLanguage}`,
            format: selectedTranscript?.format,
        });
        setRequestId(null);
    };

    return (
        <div>
            <div className="flex items-center gap-2">
                <div className="mb-3 basis-1/2">
                    <h3 className="text-sm mb-1">{t("From")}</h3>
                    {transcripts?.length > 0 && (
                        <select
                            className="lb-select"
                            value={selectedTranscript?.name || ""}
                            onChange={(event) =>
                                setSelectedTranscript(
                                    transcripts.find(
                                        (transcript) =>
                                            transcript.name ===
                                            event.target.value,
                                    ),
                                )
                            }
                        >
                            <option value="">{t("Select transcript")}</option>
                            {transcripts.map((transcript) => (
                                <option
                                    key={transcript.name}
                                    value={transcript.name}
                                >
                                    {transcript.name}{" "}
                                    {transcript.format
                                        ? `(${transcript.format})`
                                        : ""}
                                </option>
                            ))}
                        </select>
                    )}
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
                        <option>{t("Arabic")}</option>
                        <option>{t("English (UK)")}</option>
                        <option>{t("English (US)")}</option>
                        <option>{t("French")}</option>
                        <option>{t("Spanish")}</option>
                        <option>{t("German")}</option>
                        <option>{t("Hebrew")}</option>
                        <option>{t("Italian")}</option>
                        <option>{t("Portuguese")}</option>
                        <option>{t("Chinese")}</option>
                        <option>{t("Japanese")}</option>
                        <option>{t("Korean")}</option>
                        <option>{t("Bosnian")}</option>
                        <option>{t("Croatian")}</option>
                        <option>{t("Serbian")}</option>
                        <option>{t("Russian")}</option>
                        <option>{t("Turkish")}</option>
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
