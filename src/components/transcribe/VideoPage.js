"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useApolloClient } from "@apollo/client";
import {
    CheckIcon,
    CopyIcon,
    DownloadIcon,
    PlusIcon,
    RefreshCwIcon,
    TextIcon,
    VideoIcon,
} from "lucide-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import classNames from "../../../app/utils/class-names";
import { AuthContext } from "../../App";
import { QUERIES } from "../../graphql";
import AddTrackDialog from "./AddTrackDialog";
import AzureVideoTranslate from "./AzureVideoTranslate";
import { AddTrackButton } from "./TranscriptionOptions";
import TranscriptView from "./TranscriptView";
import VideoInput from "./VideoInput";
import { convertSrtToVtt } from "./transcribe.utils";

const isValidUrl = (url) => {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
};

const isAudioFile = (url) => {
    if (!url) return false;
    const audioExtensions = [".mp3", ".wav", ".ogg", ".m4a", ".aac"];
    return audioExtensions.some((ext) => url.toLowerCase().endsWith(ext));
};

function VideoPage({ onSelect }) {
    const [transcripts, setTranscripts] = useState([]);
    const [activeTranscript, setActiveTranscript] = useState(0);
    const [asyncComplete, setAsyncComplete] = useState(false);
    const [url, setUrl] = useState("");
    const [videoInformation, setVideoInformation] = useState();
    const { t } = useTranslation();
    const apolloClient = useApolloClient();
    const [error, setError] = useState(null);
    const [fileUploadError, setFileUploadError] = useState(null);
    const { userState, debouncedUpdateUserState } = useContext(AuthContext);
    const prevUserStateRef = useRef();
    const [errorParagraph, setErrorParagraph] = useState(null);
    const videoRef = useRef(null);
    const [currentTime, setCurrentTime] = useState(0);

    const [selectedTab, setSelectedTab] = useState("transcribe");
    const [dialogOpen, setDialogOpen] = useState(false);

    const [showVideoInput, setShowVideoInput] = useState(false);

    const [isAudioOnly, setIsAudioOnly] = useState(false);

    const [showTranslateDialog, setShowTranslateDialog] = useState(false);
    const [videoLanguages, setVideoLanguages] = useState([
        { code: "en-US", label: "English", url: null },
    ]);

    const [activeLanguage, setActiveLanguage] = useState(0);

    const [copied, setCopied] = useState(false);

    const [showSubtitles, setShowSubtitles] = useState(true);

    const clearVideoInformation = () => {
        setVideoInformation("");
        setUrl("");
        setTranscripts([]);
    };

    useEffect(() => {
        if (videoInformation?.videoUrl) {
            setVideoLanguages([
                {
                    code: "original",
                    label: "Original",
                    url: videoInformation.videoUrl,
                },
                // { code: 'ar-QA', label: 'Arabic', url: "http://ajmn-aje-vod.akamaized.net/media/v1/pmp4/static/clear/665003303001/66ab4499-8a82-42a2-8fac-dbf5fba8aab5/32d8d127-0699-47a6-93b2-0633aca281df/main.mp4" }
            ]);
            setActiveLanguage(0);
        }
    }, [videoInformation]);

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
                        setTranscripts([]);
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
        setTranscripts((prev) => [
            ...prev,
            {
                text: finalData,
                format: "vtt",
                name: `Transcript ${prev.length + 1}`,
            },
        ]);
        if (finalData.trim() && currentOperation === "Transcribing") {
            if (textFormatted) {
                setCurrentOperation(t("Formatting"));
                fetchParagraph(finalData);
                return;
            }
        }
        setAsyncComplete(true);
    };

    useEffect(() => {
        asyncComplete &&
            onSelect &&
            onSelect(transcripts[activeTranscript]?.text);
    }, [transcripts, asyncComplete, onSelect, activeTranscript]);

    const handleVideoReady = () => {
        if (videoRef.current && videoRef.current.videoHeight === 0) {
            setIsAudioOnly(true);
        } else {
            setIsAudioOnly(false);
        }
    };

    const handleSeek = useCallback((time) => {
        console.log("handleSeek", time);
        if (videoRef.current) {
            videoRef.current.currentTime = time;
        }
    }, []);

    const handleTimeUpdate = useCallback(() => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
        }
    }, []);

    const handleCopy = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy text: ", err);
        }
    };

    if (!videoInformation && !transcripts?.length) {
        return (
            <>
                <h1 className="text-2xl font-bold">
                    Transcription and translation
                </h1>
                <p className="text-sm text-gray-500">
                    Transcribe and translate video and audio files.
                </p>
                <h3>How would you like to start?</h3>
                <div className="flex gap-4 mt-4">
                    <button
                        onClick={() => setShowVideoInput(true)}
                        className="lb-outline-secondary rounded-lg flex justify-center p-6"
                    >
                        <div className="text-center flex flex-col gap-2">
                            <div className="flex justify-center">
                                <VideoIcon className="w-12 h-12" />
                            </div>
                            I have a video or audio file
                        </div>
                    </button>
                    <button
                        onClick={() => {
                            setDialogOpen(true);
                            setSelectedTab("transcribe");
                        }}
                        className="lb-outline-secondary rounded-lg flex justify-center p-6"
                    >
                        <div className="text-center flex flex-col gap-2">
                            <div className="flex justify-center">
                                <TextIcon className="w-12 h-12" />
                            </div>
                            I have a transcript or subtitles
                        </div>
                    </button>
                </div>
                <AddTrackDialog
                    dialogOpen={dialogOpen}
                    setDialogOpen={setDialogOpen}
                    url={url}
                    transcripts={transcripts}
                    onAdd={(x) => {
                        if (x) {
                            setTranscripts((prev) => [...prev, x]);
                        }

                        console.log("onAdd", x);
                        setDialogOpen(false);
                    }}
                    options={["upload", "clipboard"]}
                    async={true}
                    apolloClient={apolloClient}
                    activeTranscript={activeTranscript}
                />
                <Dialog open={showVideoInput} onOpenChange={setShowVideoInput}>
                    <DialogContent className="min-w-[80%] max-h-[80%] overflow-auto">
                        <DialogHeader>
                            <DialogTitle>
                                {t("Enter video or audio")}
                            </DialogTitle>
                            <DialogDescription>
                                You can either enter a URL or upload a video or
                                audio file.
                            </DialogDescription>
                        </DialogHeader>
                        <VideoInput
                            url={url}
                            setUrl={setUrl}
                            debouncedUpdateUserState={debouncedUpdateUserState}
                            setVideoInformation={(videoInfo) => {
                                setVideoInformation(videoInfo);
                                setShowVideoInput(false);
                            }}
                            onCancel={() => setShowVideoInput(false)}
                        />
                    </DialogContent>
                </Dialog>
            </>
        );
    }

    let vttUrl = null;
    if (transcripts[activeTranscript]?.format === "vtt") {
        const file = new Blob([transcripts[activeTranscript].text], {
            type: "text/plain",
        });
        vttUrl = URL.createObjectURL(file);
    } else if (transcripts[activeTranscript]?.format === "srt") {
        const vttSubtitles = convertSrtToVtt(
            transcripts[activeTranscript].text,
        );
        const file = new Blob([vttSubtitles], { type: "text/plain" });
        vttUrl = URL.createObjectURL(file);
    }

    return (
        <div className="p-2">
            <div className="flex items-center gap-4 mb-4 justify-end">
                <button
                    onClick={() => {
                        if (
                            window.confirm(
                                "Are you sure you want to start over?",
                            )
                        ) {
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
            <div>
                <div
                    className={`video-player-container overflow-hidden mb-4 ${isAudioOnly ? "h-[50px] w-96" : ""}`}
                >
                    {isValidUrl(videoInformation?.videoUrl) ? (
                        <>
                            <div className="flex gap-4">
                                <div className="w-[calc(100%-10rem)]">
                                    <div className="bg-[#000] rounded-lg flex justify-center items-center">
                                        <video
                                            className={`rounded-lg ${isAudioOnly ? "h-[50px] w-96" : "grow max-h-[500px]"}`}
                                            ref={videoRef}
                                            src={
                                                videoLanguages[activeLanguage]
                                                    ?.url
                                            }
                                            controls
                                            onLoadedData={handleVideoReady}
                                            onTimeUpdate={handleTimeUpdate}
                                            controlsList="nodownload"
                                        >
                                            {vttUrl && showSubtitles && (
                                                <track
                                                    kind="subtitles"
                                                    src={vttUrl}
                                                    srcLang="en"
                                                    label="English"
                                                    default
                                                />
                                            )}
                                        </video>
                                    </div>
                                    {transcripts.length > 0 && (
                                        <div className="flex items-center gap-2 mt-2">
                                            <Checkbox
                                                disabled={
                                                    transcripts.length === 0 ||
                                                    !vttUrl
                                                }
                                                id="showSubtitles"
                                                checked={showSubtitles}
                                                onCheckedChange={
                                                    setShowSubtitles
                                                }
                                            />
                                            <label
                                                htmlFor="showSubtitles"
                                                className={classNames(
                                                    "text-sm",
                                                    !vttUrl
                                                        ? "text-gray-400"
                                                        : "text-gray-600",
                                                )}
                                            >
                                                Show subtitles overlay
                                            </label>
                                        </div>
                                    )}
                                    <div className="flex gap-2 mt-2 items-center py-1 px-2 bg-gray-100 rounded-md">
                                        <div className="text-xs text-gray-500 break-all flex-grow truncate">
                                            {videoLanguages[activeLanguage]
                                                ?.url ||
                                                videoInformation.videoUrl}
                                        </div>
                                        <button
                                            onClick={() =>
                                                handleCopy(
                                                    videoLanguages[
                                                        activeLanguage
                                                    ]?.url ||
                                                        videoInformation.videoUrl,
                                                )
                                            }
                                            className="p-1 hover:bg-gray-100 rounded transition-colors"
                                            title="Copy URL"
                                        >
                                            {copied ? (
                                                <CheckIcon className="h-4 w-4 text-green-500" />
                                            ) : (
                                                <CopyIcon className="h-4 w-4 text-gray-500" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2 w-[10rem]">
                                    <p className="text-sm font-semibold text-gray-500">
                                        Video available in
                                    </p>
                                    <div className="flex flex-col gap-2">
                                        {videoLanguages.map((lang, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center"
                                            >
                                                <div className="flex w-full rounded-md border border-gray-200 overflow-hidden">
                                                    <button
                                                        onClick={() => {
                                                            setActiveLanguage(
                                                                idx,
                                                            );
                                                        }}
                                                        className={`flex-grow text-left text-sm px-3 py-1.5 hover:bg-sky-100 active:bg-sky-200 transition-colors
                                                            ${activeLanguage === idx ? "bg-sky-50 text-gray-900" : "text-gray-600"}`}
                                                    >
                                                        {lang.label}
                                                    </button>
                                                    {lang.label && (
                                                        <a
                                                            target="_blank"
                                                            href={lang.url}
                                                            download={`video-${lang.code}.mp4`}
                                                            className="px-2 hover:bg-sky-50 transition-colors border-l border-gray-200 flex items-center cursor-pointer"
                                                            onClick={(e) =>
                                                                e.stopPropagation()
                                                            }
                                                            title="Download video"
                                                        >
                                                            <DownloadIcon className="h-4 w-4 text-gray-500" />
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() =>
                                            setShowTranslateDialog(true)
                                        }
                                        className="lb-outline-secondary lb-sm flex items-center gap-1"
                                    >
                                        <PlusIcon className="h-4 w-4" />
                                        Add Language
                                    </button>
                                </div>
                            </div>

                            <Dialog
                                open={showTranslateDialog}
                                onOpenChange={setShowTranslateDialog}
                            >
                                <DialogContent className="max-w-3xl">
                                    <DialogHeader>
                                        <DialogTitle>
                                            Add Video Language
                                        </DialogTitle>
                                        <DialogDescription>
                                            Translate this video into another
                                            language using Azure's video
                                            translation service.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <AzureVideoTranslate
                                        url={videoInformation?.videoUrl}
                                        onComplete={async (
                                            targetLocale,
                                            outputUrl,
                                            vttUrls,
                                        ) => {
                                            console.log(
                                                "onComplete",
                                                targetLocale,
                                                outputUrl,
                                                vttUrls,
                                            );

                                            const originalVttUrl =
                                                vttUrls.original;
                                            const translatedVttUrl =
                                                vttUrls.translated;

                                            // Fetch the VTT content
                                            try {
                                                const addVtt = async (
                                                    vttUrl,
                                                    name,
                                                ) => {
                                                    const response =
                                                        await fetch(vttUrl);
                                                    const vttContent =
                                                        await response.text();

                                                    setTranscripts((prev) => [
                                                        ...prev,
                                                        {
                                                            url: vttUrl,
                                                            text: vttContent,
                                                            format: "vtt",
                                                            name,
                                                        },
                                                    ]);
                                                };

                                                setVideoLanguages((prev) => [
                                                    ...prev,
                                                    {
                                                        code: targetLocale,
                                                        label: new Intl.DisplayNames(
                                                            ["en"],
                                                            {
                                                                type: "language",
                                                            },
                                                        ).of(
                                                            targetLocale.split(
                                                                "-",
                                                            )[0],
                                                        ),
                                                        url: outputUrl,
                                                    },
                                                ]);

                                                await addVtt(
                                                    originalVttUrl,
                                                    "Original Subtitles",
                                                );
                                                await addVtt(
                                                    translatedVttUrl,
                                                    `${new Intl.DisplayNames(
                                                        ["en"],
                                                        { type: "language" },
                                                    ).of(
                                                        targetLocale.split(
                                                            "-",
                                                        )[0],
                                                    )} Subtitles`,
                                                );

                                                setShowTranslateDialog(false);
                                            } catch (error) {
                                                console.error(
                                                    "Failed to fetch VTT content:",
                                                    error,
                                                );
                                                // Optionally show an error message to the user
                                            }
                                        }}
                                        onQueued={(requestId) => {
                                            setShowTranslateDialog(false);
                                        }}
                                    />
                                </DialogContent>
                            </Dialog>
                        </>
                    ) : (
                        <div>
                            <button
                                onClick={() => setShowVideoInput(true)}
                                className="lb-outline-secondary flex items-center gap-1 lb-sm"
                            >
                                <PlusIcon className="h-4 w-4" />
                                {t("Add video")}
                            </button>
                            {showVideoInput && (
                                <Dialog
                                    open={showVideoInput}
                                    onOpenChange={setShowVideoInput}
                                >
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>
                                                {t("Add video")}
                                            </DialogTitle>
                                        </DialogHeader>
                                        <VideoInput
                                            url={url}
                                            setUrl={setUrl}
                                            debouncedUpdateUserState={
                                                debouncedUpdateUserState
                                            }
                                            setVideoInformation={(
                                                videoInfo,
                                            ) => {
                                                setVideoInformation(videoInfo);
                                                setShowVideoInput(false);
                                            }}
                                            onCancel={() =>
                                                setShowVideoInput(false)
                                            }
                                        />
                                    </DialogContent>
                                </Dialog>
                            )}
                        </div>
                    )}
                </div>
                <h3 className="mb-2">{t("Subtitles and transcripts")}</h3>
                <div className="flex gap-2 mb-2">
                    {transcripts.length > 0 && (
                        <div className="flex gap-2 items-center">
                            {transcripts.length <= 3 ? (
                                // Show buttons for 3 or fewer transcripts
                                transcripts.map((transcript, index) => (
                                    <button
                                        key={index}
                                        className={`lb-outline-secondary lb-sm ${activeTranscript === index ? "bg-gray-100" : ""}`}
                                        onClick={() =>
                                            setActiveTranscript(index)
                                        }
                                    >
                                        {transcript.name ||
                                            `Transcript ${index + 1}`}
                                    </button>
                                ))
                            ) : (
                                // Use Select component for more than 3 transcripts
                                <Select
                                    value={activeTranscript.toString()}
                                    onValueChange={(value) =>
                                        setActiveTranscript(parseInt(value))
                                    }
                                >
                                    <SelectTrigger className="w-[180px] py-1 text-sm">
                                        <SelectValue
                                            placeholder="Select transcript"
                                            className="text-sm py-0"
                                        >
                                            {transcripts[activeTranscript]
                                                ?.name ||
                                                `Transcript ${activeTranscript + 1}`}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {transcripts.map(
                                            (transcript, index) => (
                                                <SelectItem
                                                    key={index}
                                                    value={index.toString()}
                                                >
                                                    {transcript.name ||
                                                        `Transcript ${index + 1}`}
                                                </SelectItem>
                                            ),
                                        )}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    )}
                    <AddTrackButton
                        transcripts={transcripts}
                        url={
                            videoInformation?.transcriptionUrl ||
                            videoInformation?.videoUrl
                        }
                        onAdd={(transcript) => {
                            if (transcript) {
                                const { text, format, name } = transcript;

                                setTranscripts((prev) => [
                                    ...prev,
                                    { text, format, name },
                                ]);
                                setActiveTranscript(transcripts.length);
                            }
                            setDialogOpen(false);
                        }}
                        activeTranscript={activeTranscript}
                        trigger={
                            <button className="flex gap-1 items-center lb-outline-secondary lb-sm">
                                <PlusIcon className="h-4 w-4" />{" "}
                                {transcripts.length > 0
                                    ? t("")
                                    : t("Add subtitles or transcript")}
                            </button>
                        }
                        apolloClient={apolloClient}
                        dialogOpen={dialogOpen}
                        setDialogOpen={setDialogOpen}
                        selectedTab={selectedTab}
                        setSelectedTab={setSelectedTab}
                    />
                </div>
            </div>

            {(error || errorParagraph || fileUploadError) && (
                <div className="mb-4">
                    <p>
                        Error:{" "}
                        {(error || errorParagraph || fileUploadError).message}
                    </p>
                </div>
            )}

            {activeTranscript !== null &&
                transcripts[activeTranscript]?.text && (
                    <TranscriptView
                        name={transcripts[activeTranscript].name}
                        onNameChange={(name) => {
                            setTranscripts((prev) =>
                                prev.map((transcript, index) =>
                                    index === activeTranscript
                                        ? { ...transcript, name }
                                        : transcript,
                                ),
                            );
                        }}
                        url={
                            videoInformation?.transcriptionUrl ||
                            videoInformation?.videoUrl
                        }
                        text={transcripts[activeTranscript].text}
                        format={transcripts[activeTranscript].format}
                        onSeek={handleSeek}
                        currentTime={currentTime}
                        onTranslate={() => {
                            setDialogOpen(true);
                            setSelectedTab("translate");
                        }}
                        onDeleteTrack={() => {
                            setTranscripts((prev) =>
                                prev.filter(
                                    (_, index) => index !== activeTranscript,
                                ),
                            );
                            setActiveTranscript(0);
                        }}
                    />
                )}
        </div>
    );
}

export default VideoPage;
