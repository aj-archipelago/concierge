"use client";

import { useLazyQuery } from "@apollo/client";
import { useCallback, useContext, useEffect, useState } from "react";
import { Button, Form } from "react-bootstrap";
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
            <ol>
                <li>
                    <div className="selection-section">
                        {t("Choose file to transcribe:")}
                        <div className="url-loading-row">
                            <input
                                disabled={isLoading}
                                size="sm"
                                type="file"
                                accept=".mp3,.wav,.mp4"
                                className="rounded border lb-input"
                                onChange={handleFileUpload}
                            />
                        </div>
                        {t("Or enter URL:")}
                        <Form.Control
                            disabled={isLoading}
                            placeholder={t(
                                "Paste URL e.g. https://youtube.com/shorts/raw35iohE0o",
                            )}
                            value={url}
                            style={{ minWidth: "100px" }}
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
                <li>
                    <h4 className="options-header">
                        {t("Transcribe audio to:")}
                    </h4>
                    <div className="options-section">
                        <div className="radio-columns">
                            <Form.Check
                                disabled={isLoading}
                                type="radio"
                                label={t("Plain Text")}
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

                            <Form.Check
                                disabled={isLoading}
                                type="radio"
                                label={t("Formatted Text")}
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

                            <Form.Check
                                disabled={isLoading}
                                type="radio"
                                label={t("SRT Format")}
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

                            <Form.Check
                                disabled={isLoading}
                                type="radio"
                                label={t("VTT Format")}
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
                        </div>

                        <div className="radio-columns" hidden={!responseFormat}>
                            <Form.Check
                                disabled={isLoading}
                                type="radio"
                                label={t("Phrase level")}
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
                            <Form.Check
                                disabled={isLoading}
                                type="radio"
                                label={t("Word level")}
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
                            <Form.Check
                                disabled={isLoading}
                                type="radio"
                                label={t("Horizontal")}
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
                            <Form.Check
                                disabled={isLoading}
                                type="radio"
                                label={t("Vertical")}
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
                        </div>

                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                textAlign: "center",
                            }}
                        >
                            <Form.Select
                                style={{
                                    fontSize: "10px",
                                    height: "30px",
                                    minWidth: "150px",
                                    width: "180px",
                                    marginRight: "2px",
                                }}
                                disabled={isLoading}
                                onChange={(event) =>
                                    setLanguage(event.target.value)
                                }
                                defaultValue={language}
                            >
                                <option value="">
                                    {t("Auto detect video language")}
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
                            </Form.Select>
                        </div>
                    </div>
                </li>
            </ol>

        <div style={{ paddingInlineStart: '0rem',paddingBottom:'1rem' }}>
            <LoadingButton
                className={"lb-primary"}
                // type="submit"
                disabled={!url}
                loading={isLoading}
                text={t(currentOperation)}
                style={{ whiteSpace: "nowrap" }}
                onClick={() => handleSubmit()}
            >
                <FaVideo /> {t("Transcribe")}
            </LoadingButton>
            {isLoading && <ProgressBar />}
        </div>
    </>);

    const currentlyTranslating =
        !asyncComplete && currentOperation === "Translating";
    if (currentlyTranslating) {
        transcriptionOptions = (
            <div style={{ height: "47px" }}>
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
                <div
                    style={{
                        marginTop: "auto",
                        display: "flex",
                        justifyContent: "space-between",
                    }}
                >
                    <Button
                        variant="outline-secondary"
                        className="mb-3"
                        size="sm"
                        onClick={() => {
                            setRequestId(null);
                            setDataText("");
                            setUrl("");
                        }}
                    >
                        {t("Start over")}
                    </Button>

                    <div style={{ display: "flex" }}>
                        <Form.Select
                            style={{
                                fontSize: "12px",
                                height: "31px",
                                minWidth: "135px",
                                width: "135px",
                                marginRight: "5px",
                            }}
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
                        </Form.Select>

                        <Button
                            style={{ display: "inline-block" }}
                            variant="outline-primary"
                            className="mb-3"
                            size="sm"
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
                        </Button>
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
                    <div className="transcription-taxonomy-container">
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-around",
                            }}
                        >
                            <h4 className="transcription-header">
                                {t("Transcription results:")}
                            </h4>
                            <div className="download-link">
                                {responseFormat && (
                                    <span
                                        style={{ textAlign: "center" }}
                                        onClick={downloadFile}
                                    >
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
                        <div className="transcription-section">
                            <pre className="transcribe-output">{dataText}</pre>
                            <CopyButton
                                item={dataText}
                                variant={"opaque"}
                                style={{
                                    position: "absolute",
                                    top: "5px",
                                    right: "5px",
                                }}
                            />
                        </div>
                        {!responseFormat && (
                            <div>
                                <h4 className="taxonomy-header">
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
