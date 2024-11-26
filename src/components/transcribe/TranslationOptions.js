import { useApolloClient } from "@apollo/client";
import { useCallback, useState } from "react";
import { FaLanguage } from "react-icons/fa";
import { QUERIES } from "../../graphql";
import ProgressUpdate from "../editor/ProgressUpdate";
import LoadingButton from "../editor/LoadingButton";
import { useTranslation } from "react-i18next";
import { LanguageIcon } from "@heroicons/react/24/outline";
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
    activeTranscript,
    async = true,
}) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const apolloClient = useApolloClient();
    const [currentOperation, setCurrentOperation] = useState("");
    const [
        transcriptionTranslationLanguage,
        setTranscriptionTranslationLanguage,
    ] = useState("Arabic");
    const [inputText, setInputText] = useState("");
    const [requestId, setRequestId] = useState(null);
    const [selectedTranscript, setSelectedTranscript] = useState(
        transcripts[activeTranscript],
    );

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
                        text: text,
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
                    } else {
                        setFinalData(result);
                    }
                }
            } catch (e) {
                setError(e);
                console.error(e);
            } finally {
                setLoading(false);
            }
        },
        [apolloClient, async, setRequestId, t],
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

    const handleDirectTranslate = () => {
        if (!inputText || loading) return;
        setFinalData(inputText);
        fetchTranslate(inputText, transcriptionTranslationLanguage);
    };

    return (
        <div>
            <div className="flex items-center gap-2">
                <div className="mb-3 basis-1/2">
                    <h3 className="text-sm mb-1">From</h3>
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
                    <h3 className="text-sm mb-1">To</h3>
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

            {requestId && (
                <div className="h-12 mb-4">
                    <ProgressUpdate
                        requestId={requestId}
                        setFinalData={setFinalData}
                        initialText={t("Translating") + "..."}
                    />
                </div>
            )}

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

            {/* <div className="mt-2 border-t border-gray-200 pt-4">
                <div className="mb-2">
                    <div className="font-semibold">{t("Direct SRT Translation")}</div>
                    <textarea
                        className="lb-input w-full mb-2"
                        rows="4"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder={t("Enter SRT text to translate")}
                    />
                    <LoadingButton
                        className="lb-primary"
                        disabled={!inputText}
                        loading={loading}
                        onClick={handleDirectTranslate}
                    >
                        <FaLanguage /> {t("Translate")}
                    </LoadingButton>
                </div>
            </div> */}
        </div>
    );
}

export default TranslationOptions;
