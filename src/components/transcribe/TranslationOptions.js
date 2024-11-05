import { useApolloClient } from "@apollo/client";
import { useCallback, useState } from "react";
import { FaLanguage } from "react-icons/fa";
import { QUERIES } from "../../graphql";
import ProgressUpdate from "../editor/ProgressUpdate";
import LoadingButton from "../editor/LoadingButton";
import { useTranslation } from "react-i18next";

function TranslationOptions({
    dataText,
    setDataText,
    setUrl,
    setRequestId,
    setAsyncComplete,
    async = true
}) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const apolloClient = useApolloClient();
    const [currentOperation, setCurrentOperation] = useState("");
    const [transcriptionTranslationLanguage, setTranscriptionTranslationLanguage] = useState("Arabic");
    const [inputText, setInputText] = useState("");

    const fetchTranslate = useCallback(
        async (text, language) => {
            try {
                setLoading(true);
                const { data } = await apolloClient.query({
                    query: QUERIES.TRANSLATE_SUBTITLE,
                    variables: { text, to: language, async },
                    fetchPolicy: "network-only",
                });
                const result =
                    data?.translate_subtitle?.result ||
                    data?.translate_gpt4?.result;

                if (result) {
                    if (async) {
                        setRequestId(result);
                        setAsyncComplete(false);
                    } else {
                        setFinalData(result);
                    }
                }
            } catch (e) {
                setError(e);
                console.error(e);
            } finally {
                setLoading(false);
                setCurrentOperation(t("Translating"));
            }
        },
        [apolloClient, async, setAsyncComplete, setRequestId, t]
    );

    const setFinalData = (finalData) => {
        setDataText(finalData);
        setRequestId(null);
        setAsyncComplete(true);
    };

    const handleDirectTranslate = () => {
        if (!inputText || loading) return;
        setFinalData(inputText);
        setCurrentOperation(t("DirectTranslation"));
        fetchTranslate(inputText, transcriptionTranslationLanguage);
    };

    return (
        <div>
            <div className="flex justify-between items-center gap-2 mb-4">
                <button
                    className="lb-outline-secondary lb-sm flex gap-2 items-center"
                    onClick={() => {
                        setRequestId(null);
                        setDataText("");
                        setUrl("");
                        setCurrentOperation("");
                    }}
                >
                    {t("Start over")}
                </button>

                <div className="flex gap-2 items-center">
                    <select
                        className="lb-select"
                        disabled={loading}
                        onChange={(event) => setTranscriptionTranslationLanguage(event.target.value)}
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

                    <LoadingButton
                        className="lb-primary"
                        loading={loading}
                        onClick={() => {
                            setCurrentOperation(t("Translating"));
                            fetchTranslate(dataText, transcriptionTranslationLanguage);
                        }}
                    >
                        <FaLanguage /> {t("Translate")}
                    </LoadingButton>
                </div>
            </div>

            {(!currentOperation || currentOperation === "DirectTranslation") && (
                <div className="mt-2 border-t border-gray-200 pt-4">
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
                </div>
            )}

            {currentOperation && (
                <div className="h-12">
                    <ProgressUpdate
                        requestId={requestId}
                        setFinalData={setFinalData}
                        initialText={t(currentOperation) + "..."}
                    />
                </div>
            )}
        </div>
    );
}

export default TranslationOptions;
