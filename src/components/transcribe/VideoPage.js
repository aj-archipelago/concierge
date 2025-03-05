"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { build, parse } from "@aj-archipelago/subvibe";
import { useApolloClient } from "@apollo/client";
import dayjs from "dayjs";
import {
    CheckIcon,
    ChevronDown,
    CopyIcon,
    DownloadIcon,
    InfoIcon,
    MoreVertical,
    PlusCircleIcon,
    PlusIcon,
    RefreshCwIcon,
    TextIcon,
    TrashIcon,
    VideoIcon,
    Volume2Icon,
} from "lucide-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaEdit, FaYoutube } from "react-icons/fa";
import ReactTimeAgo from "react-time-ago";
import classNames from "../../../app/utils/class-names";
import { AuthContext } from "../../App";
import { LanguageContext } from "../../contexts/LanguageProvider";
import {
    getYoutubeEmbedUrl,
    getYoutubeVideoId,
    isYoutubeUrl,
} from "../../utils/urlUtils";
import LoadingButton from "../editor/LoadingButton";
import AzureVideoTranslate from "./AzureVideoTranslate";
import TranscribeErrorBoundary from "./ErrorBoundary";
import InitialView from "./InitialView";
import TaxonomySelector from "./TaxonomySelector";
import { AddTrackButton } from "./TranscriptionOptions";
import TranscriptView from "./TranscriptView";
import VideoInput from "./VideoInput";
import { useAutoTranscribe } from "../../contexts/AutoTranscribeContext";
import { QUERIES } from "../../graphql";
import { useProgress } from "../../contexts/ProgressContext";
import Loader from "../../../app/components/loader";
import { isAudioUrl } from "../chat/MyFilePond";

// Add getTranscribeQuery function
const getTranscribeQuery = (modelOption) => {
    switch (modelOption) {
        case "Whisper":
            return QUERIES.TRANSCRIBE;
        case "NeuralSpace":
            return QUERIES.TRANSCRIBE_NEURALSPACE;
        case "Gemini":
            return QUERIES.TRANSCRIBE_GEMINI;
        default:
            return QUERIES.TRANSCRIBE;
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

// New TaxonomyDialog component
function TaxonomyDialog({ text }) {
    const { t } = useTranslation();

    return (
        <Dialog>
            <DialogTrigger className="lb-outline-secondary flex items-center gap-1 text-xs">
                {t("Hashtags and Topics")}
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t("Select Taxonomy")}</DialogTitle>
                </DialogHeader>
                <TaxonomySelector text={text} />
            </DialogContent>
        </Dialog>
    );
}

// New DownloadButton component
function DownloadButton({ format, name, text }) {
    const { t } = useTranslation();

    const downloadFile = (selectedFormat) => {
        let downloadText = text;

        // Convert format if needed
        if (selectedFormat === "srt") {
            const parsed = parse(downloadText);
            downloadText = build(parsed.cues, "srt");
        }

        const element = document.createElement("a");
        const file = new Blob([downloadText], { type: "text/plain" });
        element.href = URL.createObjectURL(file);
        const fileExt = selectedFormat;
        element.download = `${name}.${fileExt}`;
        element.style.display = "none";
        document.body.appendChild(element);

        const event = new MouseEvent("click");
        element.dispatchEvent(event);

        setTimeout(() => {
            document.body.removeChild(element);
            URL.revokeObjectURL(element.href);
        }, 100);
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="lb-outline-secondary flex items-center gap-1 text-xs">
                <div className="flex items-center gap-2 pe-1">
                    <DownloadIcon className="h-4 w-4" />
                    {t("Download")}
                </div>
                {(format === "srt" || format === "vtt") && (
                    <>
                        <div className="h-4 w-px bg-gray-300" />
                        <ChevronDown className="h-4 w-4 -me-[0.25rem]" />
                    </>
                )}
            </DropdownMenuTrigger>
            {format === "srt" || format === "vtt" ? (
                <DropdownMenuContent>
                    <DropdownMenuItem
                        className="text-xs"
                        onClick={() => downloadFile("srt")}
                    >
                        {t("Download SRT")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="text-xs"
                        onClick={() => downloadFile("vtt")}
                    >
                        {t("Download VTT")}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            ) : (
                <DropdownMenuContent>
                    <DropdownMenuItem
                        onClick={() => downloadFile("txt")}
                        className="text-xs"
                    >
                        {t("Download .txt")}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            )}
        </DropdownMenu>
    );
}

function EditableTranscriptSelect({
    transcripts,
    activeTranscript,
    setActiveTranscript,
    onNameChange,
    url,
    onAdd,
    apolloClient,
    addTrackDialogOpen,
    setAddTrackDialogOpen,
    selectedTab,
    setSelectedTab,
    isEditing,
    setIsEditing,
    onDeleteTrack,
}) {
    const { t } = useTranslation();
    const [editing, setEditing] = useState(false);
    const [tempName, setTempName] = useState("");
    const { isAutoTranscribing } = useAutoTranscribe();

    useEffect(() => {
        if (transcripts[activeTranscript]) {
            setTempName(
                transcripts[activeTranscript].name ||
                    `Transcript ${activeTranscript + 1}`,
            );
        }
    }, [activeTranscript, transcripts]);

    const handleSave = () => {
        if (!tempName) return;
        setEditing(false);
        onNameChange(tempName);
    };

    const handleCancel = () => {
        setEditing(false);
        if (transcripts[activeTranscript]) {
            setTempName(
                transcripts[activeTranscript].name ||
                    `Transcript ${activeTranscript + 1}`,
            );
        }
    };

    if (!transcripts.length) {
        // Show transcribing message if auto-transcription is in progress

        // Otherwise return add track button
        return (
            <>
                <AddTrackButton
                    transcripts={transcripts}
                    url={url}
                    onAdd={onAdd}
                    activeTranscript={activeTranscript}
                    trigger={
                        <button className="lb-primary flex items-center gap-1 ">
                            {t("Add subtitles or transcript")}
                        </button>
                    }
                    apolloClient={apolloClient}
                    addTrackDialogOpen={addTrackDialogOpen}
                    setAddTrackDialogOpen={setAddTrackDialogOpen}
                    selectedTab={selectedTab}
                    setSelectedTab={setSelectedTab}
                />
                {isAutoTranscribing && (
                    <div className="mt-2 flex gap-3 items-center py-2 px-3 rounded-lg border bg-gray-50 w-[500px]">
                        <Loader size="default" />
                        <div className="text-gray-700 text-sm">
                            {t("Transcribing... This may take a few minutes.")}
                        </div>
                    </div>
                )}
            </>
        );
    }

    return (
        <div className="">
            <div className="flex gap-2 items-center text-sky-600 font-semibold mb-2">
                <TextIcon className="h-4 w-4" />
                <div className="text-sm">{t("Subtitles and transcripts")}</div>
            </div>
            {editing ? (
                <div className="flex gap-2">
                    <input
                        autoFocus
                        type="text"
                        className="w-[300px] text-sm font-medium rounded-md py-1 my-[1px] px-3 border border-gray-300"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleSave();
                            if (e.key === "Escape") handleCancel();
                        }}
                    />
                    <div className="flex gap-2 items-center">
                        <div>
                            <LoadingButton
                                text={t("Saving...")}
                                loading={false}
                                className="lb-primary lb-sm"
                                onClick={handleSave}
                            >
                                {t("Save")}
                            </LoadingButton>
                        </div>
                        <div>
                            <button
                                className="lb-outline-secondary lb-sm"
                                onClick={handleCancel}
                            >
                                {t("Cancel")}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="flex flex-col md:flex-row gap-2 justify-between ">
                        <div className="flex gap-2 grow">
                            <div>
                                <Select
                                    value={activeTranscript.toString()}
                                    onValueChange={(value) =>
                                        setActiveTranscript(parseInt(value))
                                    }
                                >
                                    <SelectTrigger className="w-[300px] py-1 h-8 font-medium text-start">
                                        <SelectValue>
                                            {transcripts[activeTranscript]
                                                ?.name ||
                                                `Transcript ${activeTranscript + 1}`}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent className="overflow-hidden">
                                        {transcripts.map(
                                            (transcript, index) => (
                                                <SelectItem
                                                    className="w-[500px] border-b last:border-b-0 border-gray-100"
                                                    key={index}
                                                    value={index.toString()}
                                                >
                                                    <div className="flex flex-col py-2 w-full">
                                                        <div className="flex w-full items-center justify-between gap-4">
                                                            <div className="grow ">
                                                                {transcript.name ||
                                                                    `Transcript ${index + 1}`}
                                                            </div>
                                                            <span
                                                                className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md 
                                                ${transcripts[index].format === "vtt" ? "bg-green-100 text-green-800" : "bg-orange-100 text-orange-800"}`}
                                                            >
                                                                {transcripts[
                                                                    index
                                                                ].format ===
                                                                "vtt"
                                                                    ? t(
                                                                          "Subtitles",
                                                                      )
                                                                    : t(
                                                                          "Transcript",
                                                                      )}
                                                            </span>
                                                        </div>

                                                        <div className="flex items-center gap-2 justify-between">
                                                            <div className="text-xs text-gray-400 flex items-center">
                                                                <ReactTimeAgo
                                                                    date={
                                                                        transcript.timestamp
                                                                            ? new Date(
                                                                                  transcript.timestamp,
                                                                              ).getTime()
                                                                            : Date.now()
                                                                    }
                                                                    locale="en-US"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </SelectItem>
                                            ),
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex gap-2 items-center">
                                <AddTrackButton
                                    transcripts={transcripts}
                                    url={url}
                                    onAdd={onAdd}
                                    activeTranscript={activeTranscript}
                                    trigger={
                                        <button className="flex items-center text-sky-600 hover:text-sky-700">
                                            <PlusCircleIcon className="h-5 w-5" />
                                        </button>
                                    }
                                    apolloClient={apolloClient}
                                    addTrackDialogOpen={addTrackDialogOpen}
                                    setAddTrackDialogOpen={
                                        setAddTrackDialogOpen
                                    }
                                    selectedTab={selectedTab}
                                    setSelectedTab={setSelectedTab}
                                />
                            </div>
                        </div>
                        {!isEditing && transcripts[activeTranscript] && (
                            <div className="flex items-center gap-2 justify-end">
                                {transcripts[activeTranscript].format !==
                                    "vtt" && (
                                    <button
                                        onClick={() => setIsEditing(!isEditing)}
                                        className="lb-outline-secondary flex items-center gap-1 text-xs"
                                        title={t("Edit")}
                                    >
                                        {t("Edit")}
                                    </button>
                                )}
                                <TaxonomyDialog
                                    text={transcripts[activeTranscript].text}
                                />
                                <DownloadButton
                                    format={
                                        transcripts[activeTranscript].format
                                    }
                                    name={transcripts[activeTranscript].name}
                                    text={transcripts[activeTranscript].text}
                                />
                                <DropdownMenu>
                                    <DropdownMenuTrigger className="">
                                        <MoreVertical className="h-4 w-4" />
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        <DropdownMenuItem
                                            className="text-red-600 focus:text-red-600 focus:bg-red-50 text-xs"
                                            onClick={() => {
                                                if (
                                                    window.confirm(
                                                        t(
                                                            "Are you sure you want to delete this track?",
                                                        ),
                                                    )
                                                ) {
                                                    onDeleteTrack();
                                                }
                                            }}
                                        >
                                            {t("Delete track")}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        )}
                    </div>
                </>
            )}
            {transcripts[activeTranscript]?.timestamp && (
                <div className="flex items-center text-gray-400 text-xs py-1 px-3">
                    {t("Created")}{" "}
                    {dayjs(transcripts[activeTranscript]?.timestamp).format(
                        "MMM DD, YYYY HH:mm:ss",
                    )}
                    <span className="ml-2">
                        <button
                            title={t("Edit")}
                            className="ms-0.5 text-gray-400 hover:text-gray-600"
                            onClick={() => setEditing(true)}
                        >
                            <FaEdit className="h-4 w-4" />
                        </button>
                    </span>
                </div>
            )}
        </div>
    );
}

function VideoPlayer({
    videoLanguages,
    setYoutubePlayer,
    activeLanguage,
    onTimeUpdate,
    vttUrl,
    videoInformation,
    copied,
    handleCopy,
}) {
    const [isAudioOnly, setIsAudioOnly] = useState(
        videoLanguages[activeLanguage]?.url.includes(".mp3"),
    );
    const videoRef = useRef(null);
    const videoUrl =
        videoInformation?.videoUrl || videoLanguages[activeLanguage]?.url;
    const isYouTube = isYoutubeUrl(videoUrl);
    const embedUrl = isYouTube ? getYoutubeEmbedUrl(videoUrl) : videoUrl;

    useEffect(() => {
        if (!videoUrl || !isYouTube) return;

        // Check if script already exists
        if (!document.getElementById("youtube-iframe-api")) {
            const tag = document.createElement("script");
            tag.id = "youtube-iframe-api";
            tag.src = "https://www.youtube.com/iframe_api";
            const firstScriptTag = document.getElementsByTagName("script")[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        }

        // Poll for YT API to be ready
        const maxAttempts = 40; // 10 seconds total (40 * 250ms)
        let attempts = 0;

        const initializePlayer = () => {
            new window.YT.Player("ytplayer", {
                videoId: getYoutubeVideoId(videoUrl),
                width: 800,
                height: 450,
                events: {
                    onReady: (event) => {
                        setYoutubePlayer(event.target);
                    },
                },
            });
        };

        const pollForYT = setInterval(() => {
            if (window.YT && window.YT.loaded) {
                clearInterval(pollForYT);
                initializePlayer();
            } else if (attempts >= maxAttempts) {
                clearInterval(pollForYT);
                console.error("Timeout waiting for YouTube IFrame API to load");
            }
            attempts++;
        }, 250);

        // Cleanup
        return () => {
            clearInterval(pollForYT);
            setYoutubePlayer(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoUrl, isYouTube]);

    const handleVideoReady = () => {
        if (
            !isYouTube &&
            videoRef.current &&
            videoRef.current.videoHeight === 0
        ) {
            setIsAudioOnly(true);
        } else {
            setIsAudioOnly(false);
        }
    };

    return (
        <div className="flex flex-col gap-1">
            <div
                className={classNames(
                    "rounded-lg flex justify-center items-center ",
                    isAudioOnly ? "h-[50px] w-96" : "w-full bg-[#000] border",
                )}
            >
                {isYouTube ? (
                    <div className="w-full relative h-[40vh] max-h-[40vh]">
                        <div
                            id="ytplayer"
                            className="rounded-lg aspect-video mx-auto max-w-full h-full"
                            src={embedUrl}
                            allowFullScreen
                            title="YouTube video player"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        />
                    </div>
                ) : (
                    <video
                        className={`rounded-lg ${isAudioOnly ? "h-[50px] w-96" : "w-full max-h-[40vh]"}`}
                        ref={videoRef}
                        src={videoUrl}
                        controls
                        onLoadedData={handleVideoReady}
                        onTimeUpdate={() =>
                            onTimeUpdate(videoRef.current?.currentTime)
                        }
                        controlsList="nodownload"
                    >
                        {vttUrl && (
                            <track
                                kind="subtitles"
                                src={vttUrl}
                                srcLang="en"
                                label="English"
                                default
                            />
                        )}
                    </video>
                )}
            </div>

            <div className="">
                {/* Note message removed as we're now properly handling YouTube vs video vs audio files */}
            </div>
            <VideoInformationBox
                videoInformation={videoInformation}
                videoLanguages={videoLanguages}
                activeLanguage={activeLanguage}
                copied={copied}
                handleCopy={handleCopy}
            />
        </div>
    );
}

// New component for video information
function VideoInformationBox({
    videoInformation,
    videoLanguages,
    activeLanguage,
    copied,
    handleCopy,
}) {
    const { t } = useTranslation();
    const currentUrl =
        videoLanguages[activeLanguage]?.url || videoInformation?.videoUrl;
    const [isExpanded, setIsExpanded] = useState(false);
    const [mediaInfo, setMediaInfo] = useState(null);

    useEffect(() => {
        // For YouTube videos, we don't need to check the media type
        if (isYoutubeUrl(currentUrl)) {
            setMediaInfo({
                type: "youtube",
                icon: <FaYoutube className="h-4 w-4 text-red-500" />,
                label: t("YouTube Video"),
            });
            return;
        }

        // For other media, create a temporary media element to check type
        const isAudioURL =
            currentUrl?.toLowerCase().includes("audio") ||
            currentUrl?.toLowerCase().includes(".mp3");
        const element = isAudioURL
            ? new Audio()
            : document.createElement("video");

        element.onloadedmetadata = () => {
            // Try to get MIME type from the currentSrc
            let mimeType = "";
            try {
                const contentType = element.currentSrc
                    .split(";")[0]
                    .split("/")
                    .pop();
                // Clean up the MIME type - remove query parameters and decode URL
                mimeType = contentType.split("?")[0].split("#")[0];
                // Handle encoded URLs
                mimeType = decodeURIComponent(mimeType);
                // Extract just the extension if it's a filename
                if (mimeType.includes(".")) {
                    mimeType = mimeType.split(".").pop();
                }
                mimeType = mimeType.toUpperCase();
            } catch (error) {
                console.error("Error extracting MIME type:", error);
                mimeType = isAudioURL ? "MP3" : "MP4";
            }

            if (element instanceof HTMLAudioElement || isAudioURL) {
                setMediaInfo({
                    type: "audio",
                    icon: <Volume2Icon className="h-4 w-4" />,
                    label: t("Audio File"),
                    extension: mimeType || "MP3",
                });
            } else {
                setMediaInfo({
                    type: "video",
                    icon: <VideoIcon className="h-4 w-4" />,
                    label: t("Video File"),
                    extension: mimeType || "MP4",
                });
            }
        };

        element.onerror = () => {
            // Fallback if we can't determine the type
            setMediaInfo({
                type: "unknown",
                icon: <VideoIcon className="h-4 w-4" />,
                label: t("Media File"),
                extension: t("Unknown"),
            });
        };

        // Try to load just the metadata
        element.preload = "metadata";
        element.src = currentUrl;

        return () => {
            element.src = "";
            element.remove();
        };
    }, [currentUrl, t]);

    return (
        <div className="p-2 border border-gray-200/50 rounded-lg">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={classNames(
                    "w-full flex items-center justify-between text-xs font-medium text-gray-500 hover:text-sky-700",
                    isExpanded ? "mb-4" : "",
                )}
            >
                <div className="flex items-center gap-1.5">
                    <InfoIcon className="h-4 w-4" />
                    {t("File Information")}
                </div>
                <ChevronDown
                    className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                />
            </button>
            {isExpanded && mediaInfo && (
                <div className="space-y-2">
                    <div className="grid grid-cols-[40px_1fr] gap-2 items-center">
                        <div className="text-xs text-gray-500">{t("Type")}</div>
                        <div className="flex items-center gap-1 text-xs text-gray-600">
                            {mediaInfo.icon}
                            <span>{mediaInfo.label}</span>
                            {mediaInfo.extension && (
                                <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-medium">
                                    {mediaInfo.extension}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-[40px_1fr] gap-2 items-center">
                        <div className="text-xs text-gray-500">{t("URL")}</div>
                        <div className="w-full flex gap-2 overflow-hidden items-center py-1 px-2 rounded-md bg-gray-100">
                            <div className="text-xs text-gray-600 truncate grow">
                                {currentUrl}
                            </div>
                            <button
                                onClick={() => handleCopy(currentUrl)}
                                className="p-1 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                                title={t("Copy URL")}
                            >
                                {copied ? (
                                    <CheckIcon className="h-4 w-4 text-green-500" />
                                ) : (
                                    <CopyIcon className="h-4 w-4 text-gray-500" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function VideoPage() {
    const [transcripts, setTranscripts] = useState([]);
    const [activeTranscript, setActiveTranscript] = useState(0);
    const [url, setUrl] = useState("");
    const [videoInformation, setVideoInformation] = useState();
    const [isEditing, setIsEditing] = useState(false);
    const { t } = useTranslation();
    const apolloClient = useApolloClient();
    const { userState, debouncedUpdateUserState } = useContext(AuthContext);
    const { attemptedAutoTranscribe, markAttempted, setIsAutoTranscribing } =
        useAutoTranscribe();
    const prevUserStateRef = useRef();
    const [currentTime, setCurrentTime] = useState(0);
    const [selectedTab, setSelectedTab] = useState("transcribe");
    const [addTrackDialogOpen, setAddTrackDialogOpen] = useState(false);
    const [showVideoInput, setShowVideoInput] = useState(false);
    const [showTranslateDialog, setShowTranslateDialog] = useState(false);
    const [videoLanguages, setVideoLanguages] = useState([]);
    const [activeLanguage, setActiveLanguage] = useState(0);
    const [copied, setCopied] = useState(false);
    const [vttUrl, setVttUrl] = useState(null);
    const { language } = useContext(LanguageContext);
    const [isUploading, setIsUploading] = useState(false);
    const [youtubePlayer, setYoutubePlayer] = useState(null);
    const [isYTPlaying, setIsYTPlaying] = useState(false);

    const { addProgressToast } = useProgress();

    // Handle VTT URL creation and cleanup
    useEffect(() => {
        if (transcripts[activeTranscript]?.format === "vtt") {
            const file = new Blob([transcripts[activeTranscript].text], {
                type: "text/plain",
            });
            const url = URL.createObjectURL(file);
            setVttUrl(url);

            return () => {
                URL.revokeObjectURL(url);
            };
        } else {
            setVttUrl(null);
        }
    }, [transcripts, activeTranscript]);

    const handleCopy = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy text: ", err);
        }
    };

    const updateUserState = useCallback(
        (updates) => {
            console.log("updateUserState", updates, userState?.transcribe, {
                transcribe: {
                    ...userState?.transcribe,
                    ...updates,
                },
            });
            setTimeout(() => {
                debouncedUpdateUserState({
                    transcribe: {
                        ...userState?.transcribe,
                        ...updates,
                    },
                });
            }, 0);
        },
        [userState?.transcribe, debouncedUpdateUserState],
    );

    const clearVideoInformation = () => {
        setVideoInformation("");
        setUrl("");
        setTranscripts([]);
        setVideoLanguages([]);
        setActiveLanguage(0);
        updateUserState({
            videoInformation: null,
            transcripts: [],
            videoLanguages: [],
        });
    };

    useEffect(() => {
        if (userState) {
            if (
                userState.transcribe?.url !==
                prevUserStateRef.current?.transcribe?.url
            ) {
                setUrl(userState.transcribe?.url);
            }
            if (
                userState.transcribe?.videoInformation?.videoUrl !==
                prevUserStateRef.current?.transcribe?.videoInformation?.videoUrl
            ) {
                setVideoInformation(userState.transcribe?.videoInformation);
            }

            if (
                userState.transcribe?.videoInformation?.videoLanguages
                    ?.length !==
                prevUserStateRef.current?.transcribe?.videoInformation
                    ?.videoLanguages?.length
            ) {
                setVideoLanguages(
                    userState.transcribe?.videoInformation?.videoLanguages ||
                        [],
                );
            }

            if (
                userState.transcribe?.transcripts?.length !==
                prevUserStateRef.current?.transcribe?.transcripts?.length
            ) {
                setTranscripts(userState.transcribe?.transcripts || []);
            }

            if (
                userState.transcribe?.activeTranscript !== undefined &&
                userState.transcribe?.activeTranscript !==
                    prevUserStateRef.current?.transcribe?.activeTranscript
            ) {
                setActiveTranscript(userState.transcribe.activeTranscript);
            }

            prevUserStateRef.current = userState;
        }
    }, [userState]);

    useEffect(() => {
        if (
            videoInformation?.videoUrl &&
            (!videoLanguages?.length ||
                !videoLanguages.find(
                    (lang) => lang.url === videoInformation.videoUrl,
                ))
        ) {
            const initialLanguages = [
                {
                    code: "original",
                    label: t("Original"),
                    url: videoInformation.videoUrl,
                },
            ];
            setVideoLanguages(initialLanguages);
            setActiveLanguage(0);

            console.log("initialLanguages", initialLanguages, videoInformation);
            updateUserState({
                videoInformation: {
                    ...videoInformation,
                    videoLanguages: initialLanguages,
                },
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoInformation]);

    useEffect(() => {
        if (videoInformation) {
            updateUserState({
                videoInformation: {
                    ...videoInformation,
                },
                transcripts,
            });
        }
        if (transcripts.length) {
            markAttempted(videoInformation?.videoUrl);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transcripts]);

    useEffect(() => {
        if (videoInformation) {
            updateUserState({
                videoInformation: {
                    ...videoInformation,
                    videoLanguages,
                },
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoLanguages]);

    const addSubtitleTrack = useCallback(
        (transcript) => {
            if (transcript) {
                const { text, format, name } = transcript;

                setTranscripts((prev) => {
                    // Find existing tracks with the same name and get the highest number
                    const baseNameMatch = name.match(/(.*?)(?:\s+\((\d+)\))?$/);
                    const baseName = baseNameMatch[1];
                    const existingNumbers = prev
                        .filter((t) => t.name && t.name.startsWith(baseName))
                        .map((t) => {
                            const match = t.name.match(
                                new RegExp(`${baseName}\\s+\\((\\d+)\\)$`),
                            );
                            return match ? parseInt(match[1]) : 0;
                        });

                    // Determine the new name with suffix if needed
                    let newName = name;
                    if (prev.some((t) => t.name === name)) {
                        const nextNumber =
                            existingNumbers.length > 0
                                ? Math.max(...existingNumbers) + 1
                                : 1;
                        newName = `${baseName} (${nextNumber})`;
                    }

                    const updatedTranscripts = [
                        ...prev,
                        {
                            text,
                            format,
                            name: newName,
                            timestamp: new Date().toISOString(),
                        },
                    ];
                    setActiveTranscript(updatedTranscripts.length - 1);

                    updateUserState({
                        videoInformation: {
                            ...userState?.transcribe?.videoInformation,
                        },
                        transcripts: updatedTranscripts,
                    });

                    return updatedTranscripts;
                });
            }
            setAddTrackDialogOpen(false);
        },
        [updateUserState, userState?.transcribe?.videoInformation],
    );

    const handleSeek = useCallback(
        (time) => {
            if (isYoutubeUrl(videoInformation?.videoUrl)) {
                // For YouTube videos, use the stored player instance
                if (youtubePlayer) {
                    try {
                        youtubePlayer.seekTo(time, true);
                    } catch (error) {
                        console.error("Error seeking YouTube video:", error);
                    }
                }
            } else {
                // For regular videos, use the video element API
                const videoElement = document.querySelector("video");
                if (videoElement) {
                    videoElement.currentTime = time;
                }
            }
        },
        [videoInformation?.videoUrl, youtubePlayer],
    );

    // Add YouTube player state change handler
    const handleYTStateChange = useCallback((event) => {
        // YT.PlayerState.PLAYING === 1
        setIsYTPlaying(event.data === 1);
    }, []);

    // Update time only when playing
    useEffect(() => {
        let timeUpdateInterval;

        if (
            isYoutubeUrl(videoInformation?.videoUrl) &&
            youtubePlayer &&
            isYTPlaying
        ) {
            timeUpdateInterval = setInterval(() => {
                try {
                    const currentTime = youtubePlayer.getCurrentTime();
                    setCurrentTime(currentTime);
                } catch (error) {
                    console.error("Error getting YouTube current time:", error);
                }
            }, 250); // Update 4 times per second
        }

        return () => {
            if (timeUpdateInterval) {
                clearInterval(timeUpdateInterval);
            }
        };
    }, [videoInformation?.videoUrl, youtubePlayer, isYTPlaying]);

    // Add the state change event listener when creating YouTube player
    useEffect(() => {
        if (youtubePlayer) {
            youtubePlayer.addEventListener(
                "onStateChange",
                handleYTStateChange,
            );

            return () => {
                youtubePlayer.removeEventListener(
                    "onStateChange",
                    handleYTStateChange,
                );
            };
        }
    }, [youtubePlayer, handleYTStateChange]);

    const handleActiveTranscriptChange = (index) => {
        setActiveTranscript(index);
        updateUserState({
            activeTranscript: index,
        });
    };

    // Add function to start transcription
    const startTranscription = useCallback(async () => {
        const videoUrl =
            videoInformation?.transcriptionUrl || videoInformation?.videoUrl;
        if (!videoUrl || !apolloClient) return;

        try {
            setIsAutoTranscribing(true);
            const isYouTubeVideo = isYoutubeUrl(videoUrl);
            const modelOption = isYouTubeVideo ? "Gemini" : "Whisper";
            const _query = getTranscribeQuery(modelOption);

            const { data } = await apolloClient.query({
                query: _query,
                variables: {
                    file: videoUrl,
                    language: "", // Auto-detect
                    wordTimestamped: false,
                    responseFormat: "vtt", // Default to VTT format
                    async: true,
                },
                fetchPolicy: "network-only",
            });

            const dataResult =
                data?.transcribe?.result ||
                data?.transcribe_neuralspace?.result ||
                data?.transcribe_gemini?.result;

            if (dataResult) {
                addProgressToast(
                    dataResult,
                    t("Auto-transcribing") + "...",
                    async (finalData) => {
                        setIsAutoTranscribing(false);
                        addSubtitleTrack({
                            text: finalData,
                            format: "vtt",
                            name: t("Subtitles"),
                        });
                    },
                    (error) => {
                        // Add this error handler to reset the auto-transcribing state when cancelled
                        console.error(
                            "Transcription error or cancelled:",
                            error,
                        );
                        setIsAutoTranscribing(false);
                    },
                );
            }
        } catch (error) {
            console.error("Auto-transcription error:", error);
            setIsAutoTranscribing(false);
        }
    }, [
        videoInformation?.videoUrl,
        videoInformation?.transcriptionUrl,
        apolloClient,
        addSubtitleTrack,
        t,
        addProgressToast,
        setIsAutoTranscribing,
    ]);

    // Replace the existing auto-transcription effect
    useEffect(() => {
        const videoUrl = videoInformation?.videoUrl;
        if (videoUrl && !transcripts.length && !attemptedAutoTranscribe) {
            console.log("Starting auto-transcription for:", videoUrl);
            markAttempted(videoUrl);

            startTranscription();
        }
    }, [
        videoInformation?.videoUrl,
        transcripts.length,
        attemptedAutoTranscribe,
        markAttempted,
        startTranscription,
    ]);

    if (!videoInformation && !transcripts?.length) {
        return (
            <InitialView
                setAddTrackDialogOpen={setAddTrackDialogOpen}
                setSelectedTab={setSelectedTab}
                addTrackDialogOpen={addTrackDialogOpen}
                url={url}
                transcripts={transcripts}
                addSubtitleTrack={addSubtitleTrack}
                apolloClient={apolloClient}
                activeTranscript={activeTranscript}
                setVideoInformation={setVideoInformation}
                updateUserState={updateUserState}
                setUrl={setUrl}
            />
        );
    }

    return (
        <TranscribeErrorBoundary>
            <div>
                <div className="flex flex-col gap-4 mb-4">
                    <div className="flex gap-4 justify-end">
                        <div className="flex-shrink-0 sm:w-[13rem] flex justify-end">
                            <div>
                                <button
                                    onClick={() => {
                                        if (
                                            window.confirm(
                                                t(
                                                    "Are you sure you want to start over?",
                                                ),
                                            )
                                        ) {
                                            markAttempted(false);
                                            clearVideoInformation();
                                        }
                                    }}
                                    className="lb-outline-secondary lb-sm flex items-center gap-2 flex-shrink-0"
                                    aria-label="Clear video"
                                >
                                    <RefreshCwIcon className="w-4 h-4" />
                                    {t("Start over")}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div>
                    <div className="video-player-container overflow-hidden mb-4">
                        {isValidUrl(videoInformation?.videoUrl) ? (
                            <>
                                <div className="flex gap-4 flex-col sm:flex-row">
                                    <div className="sm:w-[calc(100%-13rem)] flex flex-col gap-3">
                                        <VideoPlayer
                                            setYoutubePlayer={setYoutubePlayer}
                                            videoLanguages={videoLanguages}
                                            activeLanguage={activeLanguage}
                                            onTimeUpdate={setCurrentTime}
                                            vttUrl={vttUrl}
                                            videoInformation={videoInformation}
                                            copied={copied}
                                            handleCopy={handleCopy}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2 sm:w-[13rem]">
                                        {isYoutubeUrl(
                                            videoInformation?.videoUrl,
                                        ) ? null : (
                                            <>
                                                {(() => {
                                                    // Use the existing isAudioUrl function to detect audio files
                                                    const isAudioFile =
                                                        videoInformation?.videoUrl
                                                            ? isAudioUrl(
                                                                  videoInformation.videoUrl,
                                                              )
                                                            : false;

                                                    // Only show audio tracks section for video files
                                                    if (isAudioFile) {
                                                        return null;
                                                    }

                                                    return (
                                                        <div className="border rounded-lg border-gray-200/50 p-3 space-y-3">
                                                            <div className="text-sm text-sky-600 font-semibold text-gray-500 flex items-center gap-2">
                                                                <Volume2Icon className="h-4 w-4" />
                                                                {t(
                                                                    "Audio tracks",
                                                                )}
                                                            </div>
                                                            <div className="flex flex-col gap-2">
                                                                {videoLanguages.map(
                                                                    (
                                                                        lang,
                                                                        idx,
                                                                    ) => (
                                                                        <div
                                                                            key={
                                                                                idx
                                                                            }
                                                                            className="flex items-center"
                                                                        >
                                                                            <div className="flex w-[13rem] rounded-md border border-gray-200 overflow-hidden">
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setActiveLanguage(
                                                                                            idx,
                                                                                        );
                                                                                    }}
                                                                                    className={`grow truncate text-start text-xs px-3 py-1.5 hover:bg-sky-100 active:bg-sky-200 transition-colors
                                                                            ${activeLanguage === idx ? "bg-sky-50 text-gray-900" : "text-gray-600"}`}
                                                                                >
                                                                                    {lang.label ||
                                                                                        new Intl.DisplayNames(
                                                                                            [
                                                                                                language,
                                                                                            ],
                                                                                            {
                                                                                                type: "language",
                                                                                            },
                                                                                        ).of(
                                                                                            lang.code,
                                                                                        )}
                                                                                </button>
                                                                                <div className="flex">
                                                                                    {idx !==
                                                                                        0 &&
                                                                                        activeLanguage ===
                                                                                            idx && (
                                                                                            <button
                                                                                                onClick={(
                                                                                                    e,
                                                                                                ) => {
                                                                                                    e.stopPropagation();
                                                                                                    if (
                                                                                                        window.confirm(
                                                                                                            t(
                                                                                                                "Are you sure you want to delete this language track?",
                                                                                                            ),
                                                                                                        )
                                                                                                    ) {
                                                                                                        const newVideoLanguages =
                                                                                                            videoLanguages.filter(
                                                                                                                (
                                                                                                                    _,
                                                                                                                    i,
                                                                                                                ) =>
                                                                                                                    i !==
                                                                                                                    idx,
                                                                                                            );
                                                                                                        setVideoLanguages(
                                                                                                            newVideoLanguages,
                                                                                                        );
                                                                                                        setActiveLanguage(
                                                                                                            0,
                                                                                                        );
                                                                                                    }
                                                                                                }}
                                                                                                className="px-2 bg-sky-50 text-gray-500 hover:text-red-500 transition-colors border-gray-200 flex items-center cursor-pointer"
                                                                                                title={t(
                                                                                                    "Delete language",
                                                                                                )}
                                                                                            >
                                                                                                <TrashIcon className="h-3 w-3" />
                                                                                            </button>
                                                                                        )}
                                                                                    <a
                                                                                        target="_blank"
                                                                                        rel="noreferrer"
                                                                                        href={
                                                                                            lang.url
                                                                                        }
                                                                                        download={`video-${lang.code}.mp4`}
                                                                                        className="px-2 hover:bg-sky-50 transition-colors border-l border-gray-200 flex items-center cursor-pointer"
                                                                                        onClick={(
                                                                                            e,
                                                                                        ) =>
                                                                                            e.stopPropagation()
                                                                                        }
                                                                                        title={t(
                                                                                            "Download video",
                                                                                        )}
                                                                                    >
                                                                                        <DownloadIcon className="h-3.5 w-3.5 text-gray-500" />
                                                                                    </a>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    ),
                                                                )}
                                                            </div>
                                                            <button
                                                                onClick={() =>
                                                                    setShowTranslateDialog(
                                                                        true,
                                                                    )
                                                                }
                                                                className="lb-outline-secondary lb-sm flex items-center gap-1 w-full"
                                                            >
                                                                <PlusIcon className="h-4 w-4" />
                                                                {t(
                                                                    "Add audio track",
                                                                )}
                                                            </button>
                                                        </div>
                                                    );
                                                })()}
                                            </>
                                        )}
                                    </div>
                                </div>

                                <Dialog
                                    open={showTranslateDialog}
                                    onOpenChange={setShowTranslateDialog}
                                >
                                    <DialogContent className="max-w-3xl">
                                        <DialogHeader>
                                            <DialogTitle>
                                                {t("Add audio track")}
                                            </DialogTitle>
                                            <DialogDescription>
                                                {t(
                                                    "Translate this video into another language using Azure's video translation service.",
                                                )}
                                            </DialogDescription>
                                        </DialogHeader>
                                        <AzureVideoTranslate
                                            url={videoInformation?.videoUrl}
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
                                        onOpenChange={(open) => {
                                            // Prevent closing if upload is in progress
                                            if (!isUploading) {
                                                setShowVideoInput(open);
                                            }
                                        }}
                                    >
                                        <DialogContent className="min-w-[80%] max-h-[80%] overflow-auto">
                                            <DialogHeader>
                                                <DialogTitle>
                                                    {t("Add video")}
                                                </DialogTitle>
                                            </DialogHeader>
                                            <VideoInput
                                                url={url}
                                                setUrl={setUrl}
                                                setVideoInformation={(
                                                    videoInfo,
                                                ) => {
                                                    setVideoInformation(
                                                        videoInfo,
                                                    );
                                                    updateUserState({
                                                        videoInformation:
                                                            videoInfo,
                                                        url:
                                                            videoInfo?.videoUrl ||
                                                            "",
                                                    });
                                                    // Only close the modal when upload is complete
                                                    setShowVideoInput(false);
                                                }}
                                                onCancel={() =>
                                                    !isUploading &&
                                                    setShowVideoInput(false)
                                                }
                                                onUploadStart={() =>
                                                    setIsUploading(true)
                                                }
                                                onUploadComplete={() =>
                                                    setIsUploading(false)
                                                }
                                            />
                                        </DialogContent>
                                    </Dialog>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2 mb-2"></div>
                </div>
                <EditableTranscriptSelect
                    transcripts={transcripts}
                    activeTranscript={activeTranscript}
                    setActiveTranscript={handleActiveTranscriptChange}
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
                    onAdd={addSubtitleTrack}
                    apolloClient={apolloClient}
                    addTrackDialogOpen={addTrackDialogOpen}
                    setAddTrackDialogOpen={setAddTrackDialogOpen}
                    selectedTab={selectedTab}
                    setSelectedTab={setSelectedTab}
                    isEditing={isEditing}
                    setIsEditing={setIsEditing}
                    onDeleteTrack={() => {
                        const updatedTranscripts = transcripts.filter(
                            (_, index) => index !== (activeTranscript || 0),
                        );

                        setTranscripts(updatedTranscripts);
                        setActiveTranscript(
                            Math.max(0, updatedTranscripts.length - 1),
                        );
                        updateUserState({
                            videoInformation: {
                                ...userState?.transcribe?.videoInformation,
                            },
                            transcripts: updatedTranscripts,
                        });
                    }}
                />

                {activeTranscript !== null &&
                    transcripts[activeTranscript]?.text && (
                        <>
                            <TranscriptView
                                name={transcripts[activeTranscript].name}
                                text={transcripts[activeTranscript].text}
                                format={transcripts[activeTranscript].format}
                                onSeek={handleSeek}
                                currentTime={currentTime}
                                isEditing={isEditing}
                                setIsEditing={setIsEditing}
                                onTextChange={(newText) => {
                                    // Update the transcript text
                                    setTranscripts((prev) =>
                                        prev.map((transcript, index) =>
                                            index === activeTranscript
                                                ? {
                                                      ...transcript,
                                                      text: newText,
                                                  }
                                                : transcript,
                                        ),
                                    );

                                    // Update user state with new transcripts
                                    updateUserState({
                                        videoInformation: {
                                            ...userState?.transcribe
                                                ?.videoInformation,
                                        },
                                        transcripts: transcripts.map(
                                            (transcript, index) =>
                                                index === activeTranscript
                                                    ? {
                                                          ...transcript,
                                                          text: newText,
                                                      }
                                                    : transcript,
                                        ),
                                    });
                                }}
                            />
                        </>
                    )}
            </div>
        </TranscribeErrorBoundary>
    );
}

export default VideoPage;
