"use client";

import { useLazyQuery } from "@apollo/client";
import { useCallback, useEffect, useState } from "react";
import { Form } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { FaVideo } from "react-icons/fa";
import { QUERIES } from "../../graphql";
import CopyButton from "../CopyButton";
import LoadingButton from "../editor/LoadingButton";
import { ProgressUpdate } from "../editor/TextSuggestions";
import TaxonomySelector from "./TaxonomySelector";

const NEXT_PUBLIC_MEDIA_API_URL =
    process.env.NEXT_PUBLIC_MEDIA_API_URL;

const NEXT_PUBLIC_API_SUBSCRIPTION_KEY =
    process.env.NEXT_PUBLIC_API_SUBSCRIPTION_KEY || "";

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

    const { responseFormat, wordTimestamped, textFormatted } =
        transcriptionOption ?? {};

    const [requestId, setRequestId] = useState(null);

    const [fileUploading, setFileUploading] = useState(false);
    const [fileUploadError, setFileUploadError] = useState(null);
    const [currentOperation, setCurrentOperation] = useState("");

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
            xhr.open("POST", NEXT_PUBLIC_MEDIA_API_URL, true);
            xhr.setRequestHeader(
                "Ocp-Apim-Subscription-Key",
                NEXT_PUBLIC_API_SUBSCRIPTION_KEY,
            );

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
          : loading || loadingParagraph;

    const handleSubmit = useCallback(() => {
        if (!url || isLoading) return;
        setCurrentOperation("Transcribing");
        fetchData({
            variables: { file: url, wordTimestamped, responseFormat, async },
        });
    }, [url, wordTimestamped, responseFormat, fetchData, isLoading, async]);

    const setFinalData = (finalData) => {
        setDataText(finalData);
        setRequestId(null);
        if (
            textFormatted &&
            finalData.trim() &&
            currentOperation === "Transcribing"
        ) {
            setCurrentOperation("Formatting");
            fetchParagraph({ variables: { text: finalData, async } });
            return;
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
                        <input
                            disabled={isLoading}
                            placeholder={t(
                                "Paste URL e.g. https://youtube.com/shorts/raw35iohE0o",
                            )}
                            value={url}
                            type="url"
                            size="sm"
                            className="lb-input"
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
                            <div>
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
                                        responseFormat === "" &&
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
                            </div>
                            <div>
                                <Form.Check
                                    disabled={isLoading}
                                    type="radio"
                                    label={t("SRT Format (phrase level)")}
                                    name="transcriptionOptions"
                                    id="srtPhraseLevel"
                                    checked={
                                        responseFormat === "srt" &&
                                        !wordTimestamped &&
                                        !textFormatted
                                    }
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
                                    label={t("SRT Format (word level)")}
                                    name="transcriptionOptions"
                                    id="srtWordLevel"
                                    checked={
                                        responseFormat === "srt" &&
                                        wordTimestamped &&
                                        !textFormatted
                                    }
                                    onChange={() =>
                                        setTranscriptionOption({
                                            responseFormat: "srt",
                                            wordTimestamped: true,
                                            textFormatted: false,
                                        })
                                    }
                                />
                            </div>
                            <div>
                                <Form.Check
                                    disabled={isLoading}
                                    type="radio"
                                    label={t("VTT Format (phrase level)")}
                                    name="transcriptionOptions"
                                    id="vttPhraseLevel"
                                    checked={
                                        responseFormat === "vtt" &&
                                        !wordTimestamped &&
                                        !textFormatted
                                    }
                                    onChange={() =>
                                        setTranscriptionOption({
                                            responseFormat: "vtt",
                                            wordTimestamped: false,
                                            textFormatted: false,
                                        })
                                    }
                                />
                                <Form.Check
                                    disabled={isLoading}
                                    type="radio"
                                    label={t("VTT Format (word level)")}
                                    name="transcriptionOptions"
                                    id="vttWordLevel"
                                    checked={
                                        responseFormat === "vtt" &&
                                        wordTimestamped &&
                                        !textFormatted
                                    }
                                    onChange={() =>
                                        setTranscriptionOption({
                                            responseFormat: "vtt",
                                            wordTimestamped: true,
                                            textFormatted: false,
                                        })
                                    }
                                />
                            </div>
                        </div>
                    </div>
                </li>
            </ol>
            <div className="mb-3">
                <LoadingButton
                    disabled={!url}
                    loading={isLoading}
                    text={t(currentOperation)}
                    onClick={() => handleSubmit()}
                >
                    <FaVideo /> {t("Transcribe")}
                </LoadingButton>
            </div>
            {isLoading && <ProgressBar />}
        </>
    );

    if (dataText && asyncComplete) {
        transcriptionOptions = (
            <>
                <button
                    className="lb-outline-secondary lb-sm mb-3"
                    size="sm"
                    onClick={() => setDataText("")}
                >
                    {t("Start over")}
                </button>
            </>
        );
    }

    return (
        <div>
            {transcriptionOptions}
            <div>
                {(error || errorParagraph || fileUploadError) && (
                    <p>
                        Error:{" "}
                        {(error || errorParagraph || fileUploadError).message}
                    </p>
                )}
                {dataText && asyncComplete && (
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
