"use client";

import { useCallback, useState, useContext } from "react";
import { useTranslation } from "react-i18next";
import { FaVideo } from "react-icons/fa";
import { QUERIES } from "../../graphql";
import LoadingButton from "../editor/LoadingButton";
import ProgressUpdate from "../editor/ProgressUpdate";
import { AuthContext, ServerContext } from "../../App";

export default function TranscriptionOptions({
    url,
    isVideoLoaded,
    setTranscript,
    setAsyncComplete,
    async = true,
    apolloClient,
}) {
    const { t } = useTranslation();
    const { neuralspaceEnabled } = useContext(ServerContext);
    
    // Move state variables from Video.js
    const [language, setLanguage] = useState("");
    const [selectedModelOption, setSelectedModelOption] = useState("Whisper");
    const [transcriptionOption, setTranscriptionOption] = useState(null);
    const [requestId, setRequestId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [currentOperation, setCurrentOperation] = useState("");
    const [error, setError] = useState(null);
    const { debouncedUpdateUserState } = useContext(AuthContext);

    const {
        responseFormat,
        wordTimestamped,
        maxLineCount,
        maxLineWidth,
        maxWordsPerLine,
        highlightWords,
    } = transcriptionOption ?? {};

    // Move handleSubmit from Video.js
    const handleSubmit = useCallback(async () => {
        if (!url || loading) return;

        setCurrentOperation(t("Transcribing"));
        try {
            setLoading(true);

            const _query = selectedModelOption === "NeuralSpace" 
                ? QUERIES.TRANSCRIBE_NEURALSPACE 
                : QUERIES.TRANSCRIBE;
            
            const { data } = await apolloClient.query({
                query: _query,
                variables: {
                    file: url,
                    language,
                    wordTimestamped,
                    responseFormat,
                    maxLineCount,
                    maxLineWidth,
                    maxWordsPerLine,
                    highlightWords,
                    async,
                },
                fetchPolicy: "network-only",
            });

            const dataResult = data?.transcribe?.result || 
                             data?.transcribe_neuralspace?.result;

            if (dataResult) {
                if (async) {
                    setTranscript("");
                    setRequestId(dataResult);
                    setAsyncComplete(false);
                } else {
                    setFinalData(dataResult);
                }
            }
        } catch (e) {
            setError(e);
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [url, language, wordTimestamped, responseFormat, maxLineCount, maxLineWidth, 
        maxWordsPerLine, highlightWords, loading, async]);

    const setFinalData = (finalData) => {
        console.log("setFinalData", finalData);
        setTranscript(finalData);
        setRequestId(null);
        setAsyncComplete(true);
    };

    return (
        <>
            {neuralspaceEnabled && (
                <span className="flex items-center pb-2">
                    <label className="text-sm px-1">
                        {t("Using model")}
                    </label>
                    <select
                        className="lb-select ml-2 w-auto flex-shrink-0"
                        disabled={loading}
                        value={selectedModelOption}
                        onChange={(e) => {
                            setSelectedModelOption(e.target.value);
                        }}
                    >
                        <option value="Whisper">Whisper</option>
                        <option value="NeuralSpace">NeuralSpace</option>
                    </select>
                </span>
            )}

            <div className="options-section flex flex-col justify-between gap-2 mb-5 p-2.5 border border-gray-300 rounded-md bg-neutral-100 w-full">
                <div className="flex flex-col">
                    <h5 className="font-semibold text-xs text-gray-400 mb-1">{t("Output format")}</h5>
                    <select
                        disabled={loading}
                        className="lb-select"
                        value={responseFormat || ""}
                        onChange={(e) => {
                            const selectedValue = e.target.value;
                            const isSrt = selectedValue === "srt";
                            const isVtt = selectedValue === "vtt";
                            setTranscriptionOption({
                                responseFormat: selectedValue,
                                wordTimestamped: false,
                                textFormatted: false,
                            });
                            debouncedUpdateUserState(prev => ({
                                ...prev,
                                outputFormat: selectedValue,
                            }));
                        }}
                    >
                        <option value="">{t("Plain Text")}</option>
                        <option value="formatted">{t("Formatted Text")}</option>
                        <option value="srt">{t("SRT Format")}</option>
                        <option value="vtt">{t("VTT Format")}</option>
                    </select>
                </div>

                <div className={`flex flex-col ${!responseFormat ? "hidden" : ""}`}>
                    <h5 className="font-semibold text-xs text-gray-400 mb-1">Transcription type</h5>
                    <select
                        disabled={loading}
                        className="lb-select"
                        value={
                            !wordTimestamped && !maxLineWidth ? "phraseLevel" :
                            wordTimestamped && !maxLineWidth ? "wordLevel" :
                            maxLineWidth === 35 ? "horizontal" :
                            maxLineWidth === 25 ? "vertical" : ""
                        }
                        onChange={(e) => {
                            const selectedValue = e.target.value;
                            let newOptions = {
                                responseFormat,
                                wordTimestamped: false,
                                textFormatted: false,
                                maxLineWidth: undefined,
                                maxLineCount: undefined,
                            };

                            if (selectedValue === "wordLevel") {
                                newOptions.wordTimestamped = true;
                                newOptions.transcriptionType = "word";
                            } else if (selectedValue === "horizontal") {
                                newOptions.wordTimestamped = true;
                                newOptions.maxLineWidth = 35;
                                newOptions.maxLineCount = 1;
                            } else if (selectedValue === "vertical") {
                                newOptions.wordTimestamped = true;
                                newOptions.maxLineWidth = 25;
                                newOptions.maxLineCount = 1;
                            }

                            setTranscriptionOption(newOptions);
                            debouncedUpdateUserState(prev => ({
                                ...prev,
                                transcriptionType: newOptions.transcriptionType || "",
                                maxLineWidth: newOptions.maxLineWidth,
                                maxLineCount: newOptions.maxLineCount,
                                wordTimestamped: newOptions.wordTimestamped,
                            }));
                        }}
                    >
                        <option value="phraseLevel">{t("Phrase level")}</option>
                        <option value="wordLevel">{t("Word level")}</option>
                        <option value="horizontal">{t("Horizontal")}</option>
                        <option value="vertical">{t("Vertical")}</option>
                    </select>
                </div>

                <div className="flex flex-col">
                    <h5 className="font-semibold text-xs text-gray-400 mb-1">{t("Language")}</h5>
                    <select
                        className="lb-select text-sm"
                        disabled={loading}
                        onChange={(event) => {
                            setLanguage(event.target.value);
                            debouncedUpdateUserState(prev => ({
                                ...prev,
                                language: event.target.value,
                            }));
                        }}
                        value={language}
                    >
                        <option value="">{t("Auto-detect video language")}</option>
                        <option value="en">{t("English")}</option>
                        <option value="ar">{t("Arabic")}</option>
                        <option value="fr">{t("French")}</option>
                        <option value="es">{t("Spanish")}</option>
                        <option value="de">{t("German")}</option>
                        <option value="he">{t("Hebrew")}</option>
                        <option value="it">{t("Italian")}</option>
                        <option value="pt">{t("Portuguese")}</option>
                        <option value="zh">{t("Chinese")}</option>
                        <option value="ja">{t("Japanese")}</option>
                        <option value="ko">{t("Korean")}</option>
                        <option value="bs">{t("Bosnian")}</option>
                        <option value="hr">{t("Croatian")}</option>
                        <option value="sr">{t("Serbian")}</option>
                        <option value="ru">{t("Russian")}</option>
                        <option value="tr">{t("Turkish")}</option>
                    </select>
                </div>
            </div>

            {isVideoLoaded && (
                <div className="pt-0 pb-4">
                    <LoadingButton
                        className="mb-2.5 lb-primary"
                        disabled={!url}
                        loading={loading}
                        text={t(currentOperation)}
                        onClick={() => handleSubmit()}
                    >
                        <FaVideo className="text-lg" /> {t("Transcribe")}
                    </LoadingButton>
                    {loading && (
                        <div>
                            {requestId && (
                                <ProgressUpdate
                                    requestId={requestId}
                                    setFinalData={setFinalData}
                                    initialText={t(currentOperation) + "..."}
                                />
                            )}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}