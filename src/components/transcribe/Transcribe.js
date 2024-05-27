"use client";

import { useLazyQuery } from "@apollo/client";
import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaVideo } from "react-icons/fa";
import { QUERIES } from "../../graphql";
import CopyButton from "../CopyButton";
import LoadingButton from "../editor/LoadingButton";
import { ProgressUpdate } from "../editor/TextSuggestions";
import TaxonomySelector from "./TaxonomySelector";
import config from "../../../config";
import { ServerContext } from "../../App";

function Transcribe({
    dataText,
    transcriptionOption,
    asyncComplete,
    setDataText,
    setTranscriptionOption,
    setAsyncComplete,
    async = true,
    onSelect,
}) {
    const [url, setUrl] = useState("");
    const [language, setLanguage] = useState("");
    const { t } = useTranslation();
    const [fetchData, { loading, error, data }] = useLazyQuery(
        QUERIES.TRANSCRIBE,
        {
            fetchPolicy: "network-only",
        },
    );
    const [
        fetchParagraph,
        {
            loading: loadingParagraph,
            error: errorParagraph,
            data: dataParagraph,
        },
    ] = useLazyQuery(QUERIES.FORMAT_PARAGRAPH_TURBO);
    const [
        fetchTranslate,
        {
            loading: loadingTranslate,
            error: errorTranslate,
            data: dataTranslate,
        },
    ] = useLazyQuery(QUERIES.TRANSLATE_GPT4);

    const {
        responseFormat,
        wordTimestamped,
        textFormatted,
        maxLineCount,
        maxLineWidth,
        maxWordsPerLine,
        highlightWords,
    } = transcriptionOption ?? {};
    const [
        transcriptionTranslationLanguage,
        setTranscriptionTranslationLanguage,
    ] = useState("Arabic");

    const [requestId, setRequestId] = useState(null);

    const [fileUploading, setFileUploading] = useState(false);
    const [fileUploadError, setFileUploadError] = useState(null);
    const [currentOperation, setCurrentOperation] = useState("");
    const { serverUrl } = useContext(ServerContext);

    // Function to handle file upload and post it to the API
    const handleFileUpload = async (event) => {
        setUrl(t("Uploading file..."));
        setFileUploading(true);

        const file = event.target.files[0];

        const setNewUrl = ({ url, error }) => {
            setFileUploading(false);
            if (error) {
                console.error(error);
                setFileUploadError({ message: error });
            }
            setUrl(url || ``);
        };

        // Create FormData object to hold the file data
        const formData = new FormData();
        formData.append("file", file);

        try {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", config.endpoints.mediaHelper(serverUrl), true);

            // Monitor the upload progress
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentage = Math.round(
                        (event.loaded * 100) / event.total,
                    );
                    setUrl(`${t("Uploading file...")} ${percentage}%`);
                }
            };

            // Handle the upload response
            xhr.onload = () => {
                if (xhr.status === 200) {
                    const data = JSON.parse(xhr.responseText);
                    setNewUrl(data);
                } else {
                    setNewUrl({
                        error: `${t("File upload failed, response:")} ${xhr.statusText}`,
                    });
                }
            };

            // Handle any upload errors
            xhr.onerror = (error) => {
                setNewUrl({ error: t("File upload failed") });
            };

            // Send the file
            setCurrentOperation(t("Uploading"));
            xhr.send(formData);
        } catch (error) {
            setNewUrl({ error: t("File upload failed") });
        }
    };

    const isLoading = fileUploading
        ? fileUploading
        : async
          ? requestId && !asyncComplete
          : loading || loadingParagraph || loadingTranslate;

    const handleSubmit = useCallback(() => {
        if (!url || isLoading) return;
        setCurrentOperation("Transcribing");
        fetchData({
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
        });
    }, [
        url,
        language,
        wordTimestamped,
        responseFormat,
        maxLineCount,
        maxLineWidth,
        maxWordsPerLine,
        highlightWords,
        fetchData,
        isLoading,
        async,
    ]);

    const setFinalData = (finalData) => {
        setDataText(finalData);
        setRequestId(null);
        if (finalData.trim() && currentOperation === "Transcribing") {
            if (textFormatted) {
                setCurrentOperation("Formatting");
                fetchParagraph({ variables: { text: finalData, async } });
                return;
            }
        }
        setAsyncComplete(true);
    };

    const ProgressBar = () => {
        return (
            <div>
                {requestId && (
                    <ProgressUpdate
                        requestId={requestId}
                        setFinalData={setFinalData}
                    />
                )}
            </div>
        );
    };

    const downloadFile = () => {
        const element = document.createElement("a");
        const file = new Blob([dataText], { type: "text/plain" });
        element.href = URL.createObjectURL(file);
        const fileExt = responseFormat === "vtt" ? "vtt" : "srt";
        element.download = `${url}_sub.${fileExt}`;
        element.style.display = "none";
        document.body.appendChild(element);

        // Trigger click event using MouseEvent constructor
        const event = new MouseEvent("click");
        element.dispatchEvent(event);

        // Cleanup
        setTimeout(() => {
            document.body.removeChild(element);
            URL.revokeObjectURL(element.href);
        }, 100);
    };

    useEffect(() => {
        // data contains requestId if async else contains text
        if (data) {
            const dataResult = data?.transcribe?.result;
            if (async) {
                setDataText("");
                setRequestId(dataResult);
                setAsyncComplete(false);
            }
        }
    }, [data, async, setDataText, setAsyncComplete]);

    useEffect(() => {
        // data contains requestId if async else contains text
        if (dataParagraph) {
            const dataResult = dataParagraph?.format_paragraph_turbo?.result;
            if (async) {
                setDataText("");
                setRequestId(dataResult);
                setAsyncComplete(false);
            }
        }
    }, [dataParagraph, async, setDataText, setAsyncComplete]);

    useEffect(() => {
        if (dataTranslate) {
            const dataResult = dataTranslate?.translate_gpt4?.result;
            if (async) {
                setRequestId(dataResult);
                setAsyncComplete(false);
            }
        }
    }, [dataParagraph, async, setDataText, setAsyncComplete, dataTranslate]);

    useEffect(() => {
        asyncComplete && onSelect && onSelect(dataText);
    }, [dataText, asyncComplete, onSelect]);

    let transcriptionOptions = (
        <>
            <ol className="list-inside">
                <li className="mb-4">
                    <div className="flex flex-col gap-2 items-stretch mb-5">
                        {t("Choose file to transcribe:")}
                        <div className="url-loading-row flex gap-2 items-center grow mb-4">
                            <input
                                disabled={isLoading}
                                type="file"
                                className="lb-input text-sm py-"
                                onChange={handleFileUpload}
                            />
                        </div>
                        {t("Or enter URL:")}
                        <input
                            disabled={isLoading}
                            placeholder={t(
                                "Paste URL e.g. https://youtube.com/shorts/raw35iohE0o",
                            )}
                            value={url}
                            className="lb-input"
                            type="text"
                            size="sm"
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyPress={(e) => {
                                if (e.key === "Enter") {
                                    handleSubmit();
                                }
                            }}
                        />
                    </div>
                </li>
                <li className="mb-4">
                    <h4 className="options-header mb-1">
                        {t("Transcribe audio to:")}
                    </h4>
                    <div className="options-section flex flex-col sm:flex-row justify-between gap-4 sm:gap-14 mb-5 p-2.5 border border-gray-300 rounded-md bg-neutral-100 w-full">
                        <div className="radio-columns flex flex-col">
                            <h5 className="font-semibold">
                                {t("Output format")}
                            </h5>
                            <label className="flex items-center">
                                <input
                                    disabled={isLoading}
                                    type="radio"
                                    className="lb-radio"
                                    name="transcriptionOptions"
                                    id="plainText"
                                    checked={
                                        !responseFormat &&
                                        !wordTimestamped &&
                                        !textFormatted
                                    }
                                    onChange={() =>
                                        setTranscriptionOption({
                                            responseFormat: "",
                                            wordTimestamped: false,
                                            textFormatted: false,
                                        })
                                    }
                                />
                                <span className="ml-2 text-base">
                                    {t("Plain Text")}
                                </span>
                            </label>
                            <label className="flex items-center">
                                <input
                                    disabled={isLoading}
                                    type="radio"
                                    className="lb-radio"
                                    name="transcriptionOptions"
                                    id="formattedText"
                                    checked={
                                        !responseFormat &&
                                        !wordTimestamped &&
                                        textFormatted
                                    }
                                    onChange={() =>
                                        setTranscriptionOption({
                                            responseFormat: "",
                                            wordTimestamped: false,
                                            textFormatted: true,
                                        })
                                    }
                                />
                                <span className="ml-2 text-base">
                                    {t("Formatted Text")}
                                </span>
                            </label>
                            <label className="flex items-center">
                                <input
                                    disabled={isLoading}
                                    type="radio"
                                    className="lb-radio"
                                    name="transcriptionOptions"
                                    id="srtPhraseLevel"
                                    checked={responseFormat === "srt"}
                                    onChange={() =>
                                        setTranscriptionOption({
                                            responseFormat: "srt",
                                            wordTimestamped: false,
                                            textFormatted: false,
                                        })
                                    }
                                />
                                <span className="ml-2 text-base">
                                    {t("SRT Format")}
                                </span>
                            </label>
                            <label className="flex items-center">
                                <input
                                    disabled={isLoading}
                                    type="radio"
                                    className="lb-radio"
                                    name="transcriptionOptions"
                                    id="vttPhraseLevel"
                                    checked={responseFormat === "vtt"}
                                    onChange={() =>
                                        setTranscriptionOption({
                                            responseFormat: "vtt",
                                            wordTimestamped: false,
                                            textFormatted: false,
                                        })
                                    }
                                />
                                <span className="ml-2 text-base">
                                    {t("VTT Format")}
                                </span>
                            </label>
                        </div>

                        <div
                            className={`radio-columns flex flex-col ${!responseFormat ? "hidden" : ""}`}
                        >
                            <h5 className="font-semibold">
                                Transcription type
                            </h5>
                            <label className="flex items-center">
                                <input
                                    disabled={isLoading}
                                    type="radio"
                                    className="lb-radio"
                                    name="transcriptionOptions2"
                                    id="phraseLevel"
                                    checked={!wordTimestamped && !maxLineWidth}
                                    onChange={() =>
                                        setTranscriptionOption({
                                            responseFormat,
                                            wordTimestamped: false,
                                            textFormatted: false,
                                        })
                                    }
                                />
                                <span className="ml-2 text-base">
                                    {t("Phrase level")}
                                </span>
                            </label>
                            <label className="flex items-center">
                                <input
                                    disabled={isLoading}
                                    type="radio"
                                    className="lb-radio"
                                    name="transcriptionOptions2"
                                    id="wordLevel"
                                    checked={wordTimestamped && !maxLineWidth}
                                    onChange={() =>
                                        setTranscriptionOption({
                                            responseFormat,
                                            wordTimestamped: true,
                                            textFormatted: false,
                                        })
                                    }
                                />
                                <span className="ml-2 text-base">
                                    {t("Word level")}
                                </span>
                            </label>
                            <label className="flex items-center">
                                <input
                                    disabled={isLoading}
                                    type="radio"
                                    className="lb-radio"
                                    name="transcriptionOptions2"
                                    id="horizontal"
                                    checked={maxLineWidth === 35}
                                    onChange={() =>
                                        setTranscriptionOption({
                                            responseFormat,
                                            wordTimestamped: true,
                                            textFormatted: false,
                                            maxLineWidth: 35,
                                            maxLineCount: 1,
                                        })
                                    }
                                />
                                <span className="ml-2 text-base">
                                    {t("Horizontal")}
                                </span>
                            </label>
                            <label className="flex items-center">
                                <input
                                    disabled={isLoading}
                                    type="radio"
                                    className="lb-radio"
                                    name="transcriptionOptions2"
                                    id="vertical"
                                    checked={maxLineWidth === 25}
                                    onChange={() =>
                                        setTranscriptionOption({
                                            responseFormat,
                                            wordTimestamped: true,
                                            textFormatted: false,
                                            maxLineWidth: 25,
                                            maxLineCount: 1,
                                        })
                                    }
                                />
                                <span className="ml-2 text-base">
                                    {t("Vertical")}
                                </span>
                            </label>
                        </div>

                        <div className="flex flex-col">
                            <h5 className="font-semibold">{t("Language")}</h5>
                            <select
                                className="lb-select text-sm"
                                disabled={isLoading}
                                onChange={(event) =>
                                    setLanguage(event.target.value)
                                }
                                defaultValue={language}
                            >
                                <option value="">
                                    {t("Auto-detect video language")}
                                </option>
                                <option value="en">{t("English")}</option>
                                <option value="ar">{t("Arabic")}</option>
                                <option value="fr">{t("French")}</option>
                                <option value="es">{t("Spanish")}</option>
                                <option value="de">{t("German")}</option>
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
                </li>
            </ol>

            <div className="pt-0 pb-4">
                <LoadingButton
                    className="mb-2.5 lb-primary"
                    disabled={!url}
                    loading={isLoading}
                    text={t(currentOperation)}
                    onClick={() => handleSubmit()}
                >
                    <FaVideo /> {t("Transcribe")}
                </LoadingButton>
                {isLoading && <ProgressBar />}
            </div>
        </>
    );

    const currentlyTranslating =
        !asyncComplete && currentOperation === "Translating";
    if (currentlyTranslating) {
        transcriptionOptions = (
            <div className="h-12">
                {isLoading && requestId && (
                    <ProgressUpdate
                        requestId={requestId}
                        setFinalData={setFinalData}
                        initialText={t(currentOperation) + "..."}
                    />
                )}
            </div>
        );
    }

    if (dataText && asyncComplete) {
        transcriptionOptions = (
            <>
                <div className="flex justify-between mt-auto">
                    <button
                        className="text-xs border border-gray-300 px-2 py-1 rounded-md mb-3"
                        onClick={() => {
                            setRequestId(null);
                            setDataText("");
                            setUrl("");
                        }}
                    >
                        {t("Start over")}
                    </button>

                    <div className="flex">
                        <select
                            className="text-xs h-8 p-1 border border-gray-300 rounded-md mr-2"
                            disabled={isLoading}
                            onChange={(event) =>
                                setTranscriptionTranslationLanguage(
                                    event.target.value,
                                )
                            }
                            defaultValue={transcriptionTranslationLanguage}
                        >
                            <option>{t("Arabic")}</option>
                            <option>{t("English (UK)")}</option>
                            <option>{t("English (US)")}</option>
                            <option>{t("French")}</option>
                            <option>{t("Spanish")}</option>
                            <option>{t("German")}</option>
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

                        <button
                            className="text-xs border border-blue-300 text-blue-600 px-2 py-1 rounded-md mb-3"
                            onClick={() => {
                                setCurrentOperation("Translating");
                                fetchTranslate({
                                    variables: {
                                        text: dataText,
                                        to: transcriptionTranslationLanguage,
                                        async,
                                    },
                                });
                            }}
                        >
                            {t("Translate")}
                        </button>
                    </div>
                </div>
            </>
        );
    }

    return (
        <div>
            {transcriptionOptions}
            <div>
                {(error ||
                    errorParagraph ||
                    errorTranslate ||
                    fileUploadError) && (
                    <p>
                        Error:{" "}
                        {
                            (
                                error ||
                                errorParagraph ||
                                errorTranslate ||
                                fileUploadError
                            ).message
                        }
                    </p>
                )}
                {dataText && (
                    <div className="transcription-taxonomy-container flex flex-col gap-2 overflow-y-auto h-[calc(100vh-250px)]">
                        <div className="flex items-center justify-between">
                            <h4 className="transcription-header text-lg mb-1">
                                {t("Transcription results:")}
                            </h4>
                            <div className="download-link cursor-pointer font-bold underline text-right mr-2">
                                {responseFormat && (
                                    <span onClick={downloadFile}>
                                        {t(
                                            `Download result as ${
                                                responseFormat === "vtt"
                                                    ? "VTT"
                                                    : "SRT"
                                            } file`,
                                        )}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="transcription-section relative">
                            <pre className="transcribe-output border border-gray-300 rounded-md p-2.5 bg-gray-200 overflow-y-auto">
                                {dataText}
                            </pre>
                            <CopyButton
                                item={dataText}
                                variant={"opaque"}
                                className="absolute top-1 right-1"
                            />
                        </div>
                        {!responseFormat && (
                            <div className="mt-4">
                                <h4 className="taxonomy-header text-lg mb-1">
                                    {t("Taxonomy: ")}
                                </h4>
                                <TaxonomySelector text={dataText} />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default Transcribe;
