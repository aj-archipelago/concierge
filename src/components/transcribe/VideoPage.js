"use client";

import { useApolloClient } from "@apollo/client";
import { ArrowRightIcon, RefreshCwIcon, UploadIcon } from "lucide-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaVideo } from "react-icons/fa";
import ReactPlayer from 'react-player';
import { Modal } from "../../../@/components/ui/modal";
import config from "../../../config";
import { AuthContext, ServerContext } from "../../App";
import { QUERIES } from "../../graphql";
import CopyButton from "../CopyButton";
import TaxonomySelector from "./TaxonomySelector";
import TranscriptionOptions from "./TranscriptionOptions";
import TranslationOptions from "./TranslationOptions";
import VideoSelector from "./VideoSelector";

const checkVideoUrl = async (url) => {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        const contentType = response.headers.get('content-type');
        return contentType && contentType.startsWith('video/');
    } catch (error) {
        return false;
    }
};

const isValidUrl = (url) => {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
};

function VideoPage({
    onSelect,
}) {
    const [transcript, setTranscript] = useState("");
    const [asyncComplete, setAsyncComplete] = useState(false);
    const [url, setUrl] = useState("");
    const [videoInformation, setVideoInformation] = useState({
        videoUrl: "http://ajmn-aje-vod.akamaized.net/media/v1/pmp4/static/clear/665003303001/b29925c2-d081-4f0f-bdbe-397a95a21029/e7f289f0-feda-42c2-89aa-72bb94eb96c6/main.mp4",
        transcriptionUrl: "http://ajmn-aje-vod.akamaized.net/media/v1/pmp4/static/clear/665003303001/b29925c2-d081-4f0f-bdbe-397a95a21029/cce69697-17ba-48f4-9fdd-a8692f8ab971/main.mp4"
,
    });
    const { t } = useTranslation();
    const apolloClient = useApolloClient();
    const [error, setError] = useState(null);
    const [fileUploading, setFileUploading] = useState(false);
    const [fileUploadError, setFileUploadError] = useState(null);
    const { serverUrl } = useContext(ServerContext);
    const { userState, debouncedUpdateUserState } = useContext(AuthContext);
    const prevUserStateRef = useRef();
    const [isVideoLoaded, setIsVideoLoaded] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [errorParagraph, setErrorParagraph] = useState(null);

    const clearVideoInformation = () => {
        setVideoInformation("");
        setUrl("");
        setIsVideoLoaded(false);
    };

    useEffect(() => {
        if (userState?.transcribe !== prevUserStateRef.current?.transcribe) {
            if (userState?.transcribe?.url) {
                setUrl(userState.transcribe.url);
            }
            prevUserStateRef.current = userState;
        }
    }, [userState]);

    const fetchParagraph = useCallback(
        async (text) => {
            try {
                setLoadingParagraph(true);
                const { data } = await apolloClient.query({
                    query: QUERIES.FORMAT_PARAGRAPH_TURBO,
                    variables: { text, async },
                    fetchPolicy: "network-only",
                });
                if (data?.format_paragraph_turbo?.result) {
                    const dataResult = data.format_paragraph_turbo.result;
                    if (async) {
                        setTranscript("");
                        setRequestId(dataResult);
                        setAsyncComplete(false);
                    } else {
                        setFinalData(dataResult);
                    }
                }
            } catch (e) {
                setErrorParagraph(e);
                console.error(e);
            } finally {
                setLoadingParagraph(false);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    const setFinalData = (finalData) => {
        setTranscript(finalData);
        setRequestId(null);
        if (finalData.trim() && currentOperation === "Transcribing") {
            if (textFormatted) {
                setCurrentOperation(t("Formatting"));
                fetchParagraph(finalData);
                return;
            }
        }
        setAsyncComplete(true);
    };

    const downloadFile = () => {
        const element = document.createElement("a");
        const file = new Blob([transcript], { type: "text/plain" });
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
        asyncComplete && onSelect && onSelect(transcript);
    }, [transcript, asyncComplete, onSelect]);

    const handleVideoReady = () => {
        setIsVideoLoaded(true);
    };

    if (!videoInformation) {
        return (
            <UrlInput
                url={url} 
                setUrl={setUrl}
                debouncedUpdateUserState={debouncedUpdateUserState}
                setVideoInformation={setVideoInformation}
            />
        );
    }

    return (
        <div className="p-2">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold mb-6">Video transcription and translation</h1>
                <button
                    onClick={() => {
                        if (window.confirm("Are you sure you want to start over?")) {
                            clearVideoInformation();
                        }
                    }}
                    className="lb-outline-secondary lb-sm flex items-center gap-2"
                    aria-label="Clear video"
                >
                    <RefreshCwIcon className="w-4 h-4" />
                    Start over
                </button>
            </div>
            <div className="flex gap-4">
                <div className="grow">
                    <div className="video-player-container bg-gray-100 rounded-lg overflow-hidden">
                        {isValidUrl(videoInformation.videoUrl) ? (
                            <ReactPlayer
                                url={videoInformation.videoUrl}
                                controls
                                width="100%"
                                onReady={handleVideoReady}
                                config={{
                                    file: {
                                        attributes: {
                                            controlsList: 'nodownload'
                                        }
                                    }
                                }}
                            />
                        ) : (
                            <div className="flex items-center justify-center text-gray-500 min-h-[270px]">
                                <div className="text-center">
                                    <FaVideo className="mx-auto mb-2 text-3xl" />
                                    <p>{t("Enter a valid video URL")}</p>
                                </div>
                            </div>
                        )}
                    </div>


                </div>
                {transcript && asyncComplete && (
                    <TranslationOptions
                        transcript={transcript}
                        setTranscript={setTranscript}
                        setUrl={setUrl}
                        setRequestId={setRequestId}
                        setAsyncComplete={setAsyncComplete}
                    />
                )}
                <div>
                    <h4 className="options-header mb-1">
                        {t("Transcribe audio to:")}
                    </h4>

                    <TranscriptionOptions
                        url={videoInformation.transcriptionUrl || videoInformation.videoUrl}
                        isVideoLoaded={isVideoLoaded}
                        setTranscript={setTranscript}
                        setAsyncComplete={setAsyncComplete}
                        apolloClient={apolloClient}
                    />
                </div>
            </div>

            <div>
                {(error ||
                    errorParagraph ||
                    fileUploadError) && (
                        <p>
                            Error:{" "}
                            {
                                (
                                    error ||
                                    errorParagraph ||
                                    fileUploadError
                                ).message
                            }
                        </p>
                    )}
                {transcript && (
                    <div className="transcription-taxonomy-container flex flex-col gap-2 overflow-y-auto h-[calc(100vh-250px)]">
                        <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-lg">
                                {t("Transcription")}:
                            </h4>
                            <div className="download-link cursor-pointer font-bold underline text-right mr-2">
                                {responseFormat && (
                                    <span onClick={downloadFile}>
                                        {t(
                                            `Download result as ${responseFormat === "vtt"
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
                                {transcript}
                            </pre>
                            <CopyButton
                                item={transcript}
                                variant={"opaque"}
                                className="absolute top-1 right-1"
                            />
                        </div>
                        {!responseFormat && (
                            <div className="mt-4">
                                <h4 className="font-semibold text-lg">
                                    {t("Taxonomy: ")}
                                </h4>
                                <TaxonomySelector text={transcript} />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function UrlInput({ url, setUrl, debouncedUpdateUserState, setVideoInformation }) {
    const { t } = useTranslation();
    const [fileUploading, setFileUploading] = useState(false);
    const [fileUploadError, setFileUploadError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

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

    return <div className="flex flex-col gap-2 items-stretch mb-5">
        <Modal
            show={isModalOpen}
            onHide={() => setIsModalOpen(false)}
        >
            <VideoSelector
                url={url}
                onSelect={v => {
                    setVideoInformation(v);
                    setIsModalOpen(false);
                }}
            />
        </Modal>
        {t("Enter a URL or Title")}

        <div className="w-full">
            <input
                placeholder={t("Paste URL e.g. https://mywebsite.com/video.mp4")}
                value={url}
                className={`lb-input w-full`}
                type="text"
                size="sm"
                onChange={(e) => {
                    setUrl(e.target.value);
                    debouncedUpdateUserState(prev => ({
                        transcribe: {
                            ...prev.transcribe,
                            url: e.target.value,
                        },
                    }));
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        handleSubmit();
                    }
                }}
            />
        </div>

        <div className="url-loading-row flex gap-2 items-center grow ">
            <label className="lb-outline-secondary text-sm flex gap-2 items-center cursor-pointer">
                <input
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                />
                <UploadIcon className="w-4 h-4" />
                {t("Upload a file")}
            </label>
            <button
                disabled={!url}
                className="lb-primary flex gap-1 ps-4 pe-3 items-center"
                onClick={async () => {
                    if (!isValidUrl(url)) {
                        setIsModalOpen(true);
                        return;
                    }

                    const isValidVideo = await checkVideoUrl(url);
                    if (isValidVideo) {
                        setVideoInformation({ videoUrl: url, transcriptionUrl: null });
                    } else {
                        setIsModalOpen(true);
                    }
                }}
            >
                {t("Next")} <ArrowRightIcon className="w-4 h-4" />
            </button>
        </div>

        <span className="text-xs text-neutral-500">
            {t("NOTE: If you use a URL from a streaming service like YouTube, we will search the internal database for the video and use that instead.")}
        </span>
    </div>
}

export default VideoPage;

