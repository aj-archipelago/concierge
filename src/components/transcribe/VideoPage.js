"use client";

import PageHeader from "../../layout/PageHeader";
import { HeaderAction } from "../../layout/HeaderControls";
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
    AlertTriangle,
    CheckIcon,
    ChevronDown,
    CopyIcon,
    DownloadIcon,
    Edit,
    InfoIcon,
    MoreVertical,
    PlusCircleIcon,
    PlusIcon,
    RefreshCwIcon,
    TextIcon,
    TrashIcon,
    VideoIcon,
    Volume2Icon,
    Youtube,
} from "lucide-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import ReactTimeAgo from "react-time-ago";
import classNames from "../../../app/utils/class-names";
import { AuthContext, ServerContext } from "../../App";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { useNotificationsContext } from "../../contexts/NotificationContext";
import {
    getYoutubeEmbedUrl,
    getYoutubeVideoId,
    isYoutubeUrl,
} from "../../utils/urlUtils";
import { getYouTubeTranscriptionAccessErrorMessage } from "../../utils/transcriptionErrors";
import LoadingButton from "../editor/LoadingButton";
import AzureVideoTranslate from "./AzureVideoTranslate";
import TranscribeErrorBoundary from "./ErrorBoundary";
import InitialView from "./InitialView";
import RealtimeAudioLiveControls from "./RealtimeAudioLiveControls";
import TaxonomySelector from "./TaxonomySelector";
import { AddTrackButton } from "./TranscriptionOptions";
import TranscriptView from "./TranscriptView";
import VideoInput from "./VideoInput";
import { useAutoTranscribe } from "../../contexts/AutoTranscribeContext";
import Loader from "../../../app/components/loader";
import { useRunTask, useTask } from "../../../app/queries/notifications";
import { isAudioUrl } from "../../utils/mediaUtils";
import { getMediaPlaybackUrl } from "../../utils/fileDownloadUtils";
import {
    getAlternateTranscribeModelOption,
    getDefaultTranscribeModelOption,
} from "./transcribeQueries";

const TERMINAL_TASK_STATUSES = new Set([
    "completed",
    "failed",
    "cancelled",
    "abandoned",
]);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LIVE_OVERLAY_GRACE_SECONDS = 2.5;

function getTextRevisionKey(text = "") {
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
        hash = (hash * 31 + text.charCodeAt(index)) | 0;
    }

    return `${text.length}:${hash >>> 0}`;
}

const isValidUrl = (url) => {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
};

function normalizeSubtitleText(text) {
    return `${text || ""}`.replace(/\s+/g, " ").trim();
}

function cueTimeToSeconds(value) {
    return Math.max(0, (value || 0) / 1000);
}

export function getLiveOverlayTextAtTime(
    liveOverlayTrack,
    currentTime = 0,
    graceSeconds = LIVE_OVERLAY_GRACE_SECONDS,
) {
    if (!liveOverlayTrack?.isLive || liveOverlayTrack?.showOnVideo === false) {
        return "";
    }

    const text = `${liveOverlayTrack.text || ""}`.trim();
    if (!text) return normalizeSubtitleText(liveOverlayTrack.previewText);

    let cues = [];
    try {
        cues = parse(text)?.cues || [];
    } catch {
        return text.startsWith("WEBVTT")
            ? ""
            : normalizeSubtitleText(liveOverlayTrack.previewText);
    }

    if (!cues.length) {
        return text.startsWith("WEBVTT")
            ? ""
            : normalizeSubtitleText(liveOverlayTrack.previewText);
    }

    const time = Math.max(0, currentTime || 0);
    const activeCue = cues.find((cue) => {
        const startTime = cueTimeToSeconds(cue.startTime);
        const endTime = cueTimeToSeconds(cue.endTime);
        return time >= startTime && time <= endTime;
    });
    if (activeCue) return normalizeSubtitleText(activeCue.text);

    const recentCue = [...cues].reverse().find((cue) => {
        const startTime = cueTimeToSeconds(cue.startTime);
        const endTime = cueTimeToSeconds(cue.endTime);
        return time >= startTime && time <= endTime + graceSeconds;
    });

    return normalizeSubtitleText(recentCue?.text);
}

const getNormalizedVideoLanguages = (videoInformation, videoLanguages, t) => {
    const languages = Array.isArray(videoLanguages) ? videoLanguages : [];
    const videoUrl = videoInformation?.videoUrl;
    if (!videoUrl || languages.some((lang) => lang?.url === videoUrl)) {
        return languages;
    }

    return [
        {
            code: "original",
            label: t("Original"),
            url: videoUrl,
        },
        ...languages,
    ];
};

const getVideoLanguagesForVideo = (videoInformation, videoLanguages) => {
    if (Array.isArray(videoInformation?.videoLanguages)) {
        return videoInformation.videoLanguages;
    }

    const languages = Array.isArray(videoLanguages) ? videoLanguages : [];
    return languages.some((lang) => lang?.url === videoInformation?.videoUrl)
        ? languages
        : [];
};

const areVideoLanguagesEqual = (first = [], second = []) =>
    first.length === second.length &&
    first.every(
        (language, index) =>
            language?.code === second[index]?.code &&
            language?.label === second[index]?.label &&
            language?.url === second[index]?.url,
    );

function downloadTranscriptFile({ format, name, text, selectedFormat }) {
    let downloadText = text;
    if (["srt", "vtt"].includes(selectedFormat) && format !== selectedFormat) {
        downloadText = build(parse(text).cues, selectedFormat);
    } else if (selectedFormat === "txt" && ["srt", "vtt"].includes(format)) {
        downloadText = parse(text)
            .cues.map((cue) => cue.text)
            .join("\n");
    }

    const element = document.createElement("a");
    const file = new Blob([downloadText], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `${name}.${selectedFormat}`;
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    setTimeout(() => {
        document.body.removeChild(element);
        URL.revokeObjectURL(element.href);
    }, 100);
}

function DownloadButton({ format, name, text }) {
    const { t } = useTranslation();

    const downloadFile = (selectedFormat) =>
        downloadTranscriptFile({ format, name, text, selectedFormat });

    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="hidden sm:flex lb-outline-secondary items-center gap-1 text-xs">
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
                    <DropdownMenuItem
                        className="text-xs"
                        onClick={() => downloadFile("txt")}
                    >
                        {t("Download .txt")}
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
    videoInformation,
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
    const [taxonomyDialogOpen, setTaxonomyDialogOpen] = useState(false);
    const activeTrackIsLive = Boolean(transcripts[activeTranscript]?.isLive);

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

    useEffect(() => {
        if (
            transcripts &&
            transcripts.length > 0 &&
            (activeTranscript >= transcripts.length ||
                !transcripts[activeTranscript])
        ) {
            setActiveTranscript(0);
        }
    }, [activeTranscript, transcripts, setActiveTranscript]);

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
                    videoInformation={videoInformation}
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
                    <div className="transcription-taxonomy-container flex flex-col gap-2 overflow-y-auto mt-2">
                        <div className="transcription-section relative">
                            <div className="border border-gray-300 dark:border-gray-600 rounded-md py-2.5 px-2.5 bg-gray-50 dark:bg-gray-700 mb-4 min-h-[200px]">
                                <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
                                    <Loader size="default" />
                                    <div className="text-sm">
                                        {t(
                                            "Transcribing... This may take a few minutes.",
                                        )}
                                    </div>
                                </div>
                            </div>
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
                        className="w-[300px] text-base md:text-sm font-medium rounded-md py-1 my-[1px] px-3 border border-gray-300 dark:border-gray-600"
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
                    <div className="flex flex-row sm:flex-col-reverse md:flex-row gap-2 justify-between ">
                        <div className="flex gap-2 items-center">
                            <div className="grow sm:grow-0 ">
                                <Select
                                    value={activeTranscript.toString()}
                                    onValueChange={(value) =>
                                        setActiveTranscript(parseInt(value))
                                    }
                                    disabled={isEditing}
                                >
                                    <SelectTrigger className="w-full sm:w-[300px] py-1 h-8 font-medium text-start">
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
                                                    className="w-[500px] border-b last:border-b-0 border-gray-100 dark:border-gray-700"
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
                                                ${
                                                    transcript.isLive
                                                        ? "bg-red-100 text-red-800"
                                                        : transcripts[index]
                                                                .format ===
                                                            "vtt"
                                                          ? "bg-green-100 text-green-800"
                                                          : "bg-orange-100 text-orange-800"
                                                }`}
                                                            >
                                                                {transcript.isLive
                                                                    ? t("Live")
                                                                    : transcripts[
                                                                            index
                                                                        ]
                                                                            .format ===
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
                                    videoInformation={videoInformation}
                                    onAdd={onAdd}
                                    activeTranscript={activeTranscript}
                                    disabled={isEditing}
                                    trigger={
                                        <button
                                            className={classNames(
                                                "flex items-center text-sky-600 hover:text-sky-700",
                                                isEditing &&
                                                    "opacity-50 cursor-not-allowed",
                                            )}
                                        >
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
                            <div className="flex flex-col sm:flex-row items-center gap-2 justify-end">
                                <div className=" w-full sm:w-auto flex gap-2 justify-end">
                                    {transcripts[activeTranscript].format !==
                                        "vtt" && (
                                        <button
                                            onClick={() =>
                                                setIsEditing(!isEditing)
                                            }
                                            className="hidden sm:flex lb-outline-secondary items-center gap-1 text-xs"
                                            title={t("Edit")}
                                        >
                                            {t("Edit")}
                                        </button>
                                    )}
                                    {/* Show the button only on desktop */}
                                    <Dialog
                                        open={taxonomyDialogOpen}
                                        onOpenChange={setTaxonomyDialogOpen}
                                    >
                                        <DialogTrigger asChild>
                                            <button
                                                className="hidden sm:flex lb-outline-secondary items-center gap-1 text-xs overflow-hidden"
                                                title={t("Hashtags and Topics")}
                                            >
                                                <div className="truncate w-full">
                                                    {t("Hashtags and Topics")}
                                                </div>
                                            </button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                                            <DialogHeader>
                                                <DialogTitle>
                                                    {t("Select Taxonomy")}
                                                </DialogTitle>
                                            </DialogHeader>
                                            <TaxonomySelector
                                                text={
                                                    transcripts[
                                                        activeTranscript
                                                    ].text
                                                }
                                            />
                                        </DialogContent>
                                    </Dialog>
                                </div>
                                <div className="w-full sm:w-auto flex gap-2 justify-end">
                                    <DownloadButton
                                        format={
                                            transcripts[activeTranscript].format
                                        }
                                        name={
                                            transcripts[activeTranscript].name
                                        }
                                        text={
                                            transcripts[activeTranscript].text
                                        }
                                    />
                                    <DropdownMenu>
                                        <DropdownMenuTrigger className="">
                                            <MoreVertical className="h-4 w-4" />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            {transcripts[activeTranscript]
                                                .format !== "vtt" && (
                                                <DropdownMenuItem
                                                    className="text-xs"
                                                    onClick={() =>
                                                        setIsEditing(!isEditing)
                                                    }
                                                >
                                                    {t("Edit")}
                                                </DropdownMenuItem>
                                            )}
                                            {/* Show the menu item only on mobile */}
                                            <DropdownMenuItem
                                                className="sm:hidden text-xs"
                                                onClick={() => {
                                                    setTimeout(() => {
                                                        setTaxonomyDialogOpen(
                                                            true,
                                                        );
                                                    }, 100);
                                                }}
                                            >
                                                {t("Hashtags and Topics")}
                                            </DropdownMenuItem>
                                            {/* Download options for mobile */}
                                            {transcripts[activeTranscript]
                                                .format === "srt" ||
                                            transcripts[activeTranscript]
                                                .format === "vtt" ? (
                                                <>
                                                    <DropdownMenuItem
                                                        className="sm:hidden text-xs"
                                                        onClick={() =>
                                                            downloadTranscriptFile(
                                                                {
                                                                    ...transcripts[
                                                                        activeTranscript
                                                                    ],
                                                                    selectedFormat:
                                                                        "srt",
                                                                },
                                                            )
                                                        }
                                                    >
                                                        {t("Download SRT")}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="sm:hidden text-xs"
                                                        onClick={() =>
                                                            downloadTranscriptFile(
                                                                {
                                                                    ...transcripts[
                                                                        activeTranscript
                                                                    ],
                                                                    selectedFormat:
                                                                        "vtt",
                                                                },
                                                            )
                                                        }
                                                    >
                                                        {t("Download VTT")}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="sm:hidden text-xs"
                                                        onClick={() =>
                                                            downloadTranscriptFile(
                                                                {
                                                                    ...transcripts[
                                                                        activeTranscript
                                                                    ],
                                                                    selectedFormat:
                                                                        "txt",
                                                                },
                                                            )
                                                        }
                                                    >
                                                        {t("Download .txt")}
                                                    </DropdownMenuItem>
                                                </>
                                            ) : (
                                                <DropdownMenuItem
                                                    className="sm:hidden text-xs"
                                                    onClick={() =>
                                                        downloadTranscriptFile({
                                                            ...transcripts[
                                                                activeTranscript
                                                            ],
                                                            selectedFormat:
                                                                "txt",
                                                        })
                                                    }
                                                >
                                                    {t("Download .txt")}
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuItem
                                                disabled={activeTrackIsLive}
                                                className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20 text-xs disabled:cursor-not-allowed disabled:opacity-50"
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
                            <Edit className="h-4 w-4" />
                        </button>
                    </span>
                </div>
            )}
        </div>
    );
}

function VideoPlayer({
    mediaElementRef,
    videoLanguages,
    setYoutubePlayer,
    activeLanguage,
    onTimeUpdate,
    currentTime,
    vttUrl,
    vttKey,
    activeSubtitleTrack,
    liveOverlayTrack,
    videoInformation,
    copied,
    handleCopy,
    onPlaybackErrorChange,
}) {
    const [isAudioOnly, setIsAudioOnly] = useState(
        videoLanguages[activeLanguage]?.url?.includes(".mp3"),
    );
    const fallbackVideoRef = useRef(null);
    const videoRef = mediaElementRef || fallbackVideoRef;
    const videoUrl =
        videoLanguages[activeLanguage]?.url || videoInformation?.videoUrl;
    const isYouTube = isYoutubeUrl(videoUrl);
    const embedUrl = isYouTube ? getYoutubeEmbedUrl(videoUrl) : videoUrl;
    const playbackVideoUrl = isYouTube
        ? videoUrl
        : getMediaPlaybackUrl(videoUrl);
    const [videoError, setVideoError] = useState(false);
    const { t } = useTranslation();
    const liveOverlayText = getLiveOverlayTextAtTime(
        liveOverlayTrack,
        currentTime,
    );

    useEffect(() => {
        onPlaybackErrorChange?.(videoError);
    }, [onPlaybackErrorChange, videoError]);

    useEffect(() => {
        if (!videoUrl || !isYouTube) return;

        // Reset error state when URL changes
        setVideoError(false);

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
                    onError: () => {
                        setVideoError(true);
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

    const handleVideoError = () => {
        setVideoError(true);
    };

    // Reset error state when URL changes
    useEffect(() => {
        setVideoError(false);
    }, [videoUrl]);

    return (
        <div className="flex flex-col gap-1">
            <div className={classNames("relative")}>
                <div
                    className={classNames(
                        "rounded-lg flex justify-center items-center overflow-hidden",
                        isAudioOnly
                            ? "h-[50px] w-96"
                            : "w-full bg-[#000] border",
                    )}
                >
                    {videoError ? (
                        <div className="w-full p-6 bg-gray-50 dark:bg-gray-800">
                            <div className="text-gray-600 font-medium mb-2 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4" />
                                {t("Video Unavailable")}
                            </div>
                            <p className="text-sm text-gray-500">
                                {t(
                                    "The video URL cannot be accessed. It may have expired or been deleted.",
                                )}
                            </p>
                        </div>
                    ) : isYouTube ? (
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
                            src={playbackVideoUrl}
                            controls
                            onLoadedData={handleVideoReady}
                            onError={handleVideoError}
                            onTimeUpdate={() =>
                                onTimeUpdate(videoRef.current?.currentTime)
                            }
                            controlsList="nodownload"
                        >
                            {vttUrl && (
                                <track
                                    key={vttKey}
                                    kind="subtitles"
                                    src={vttUrl}
                                    srcLang={
                                        activeSubtitleTrack?.targetLanguage ||
                                        activeSubtitleTrack?.sourceLanguage ||
                                        "en"
                                    }
                                    label={
                                        activeSubtitleTrack?.name ||
                                        t("Subtitles")
                                    }
                                    default
                                />
                            )}
                        </video>
                    )}
                    {liveOverlayText && !isAudioOnly && !isYouTube && (
                        <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
                            <div className="max-w-[90%] rounded-md bg-black/75 px-3 py-2 text-center text-sm leading-snug text-white shadow-lg">
                                <div className="mb-1 inline-flex items-center gap-1 rounded bg-red-600/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                                    {t("Live")}
                                </div>
                                <div className="line-clamp-3">
                                    {liveOverlayText}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
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
                icon: <Youtube className="h-4 w-4 text-red-500" />,
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
        <div className="p-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50/50 dark:bg-gray-800/50">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={classNames(
                    "w-full flex items-center justify-between text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-sky-700 dark:hover:text-sky-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-2 py-1 transition-colors",
                    isExpanded ? "mb-3" : "",
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
                <div className="space-y-3">
                    <div className="grid grid-cols-[50px_1fr] gap-3 items-center">
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                            {t("Type")}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            {mediaInfo.icon}
                            <span>{mediaInfo.label}</span>
                            {mediaInfo.extension && (
                                <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-[10px] font-medium text-gray-700 dark:text-gray-300">
                                    {mediaInfo.extension}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-[50px_1fr] gap-3 items-center">
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                            {t("URL")}
                        </div>
                        <div className="w-full flex gap-2 overflow-hidden items-center py-2 px-3 rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                            <div className="text-xs text-gray-700 dark:text-gray-300 truncate grow">
                                {currentUrl}
                            </div>
                            <button
                                onClick={() => handleCopy(currentUrl)}
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors flex-shrink-0"
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
    const transcriptsRef = useRef(transcripts);
    const activeTranscriptRef = useRef(0);
    const videoElementRef = useRef(null);
    const videoInformationRef = useRef(null);
    const [activeTranscript, setActiveTranscript] = useState(0);
    const [url, setUrl] = useState("");
    const [videoInformation, setVideoInformation] = useState();
    const [isEditing, setIsEditing] = useState(false);
    const { t } = useTranslation();
    const apolloClient = useApolloClient();
    const { userState, debouncedUpdateUserState, updateUserStateNow } =
        useContext(AuthContext);
    const {
        xaiTranscribeEnabled,
        xaiTranscribeDefaultEnabled,
        transcribeDefaultModelOption,
        transcribeAlternateModelOption,
        realtimeAudio,
    } = useContext(ServerContext);
    const { attemptedAutoTranscribe, markAttempted, setIsAutoTranscribing } =
        useAutoTranscribe();
    const prevUserStateRef = useRef();
    const [currentTime, setCurrentTime] = useState(0);
    const [selectedTab, setSelectedTab] = useState("transcribe");
    const [addTrackDialogOpen, setAddTrackDialogOpen] = useState(false);
    const [showVideoInput, setShowVideoInput] = useState(false);
    const [showTranslateDialog, setShowTranslateDialog] = useState(false);
    const [videoLanguages, setVideoLanguages] = useState([]);
    const videoLanguagesRef = useRef(videoLanguages);
    const [activeLanguage, setActiveLanguage] = useState(0);
    const [copied, setCopied] = useState(false);
    const [vttSource, setVttSource] = useState(null);
    const [clearedLiveTrackId, setClearedLiveTrackId] = useState(null);
    const [suppressPlayerSubtitleForLive, setSuppressPlayerSubtitleForLive] =
        useState(false);
    const [liveSessionActive, setLiveSessionActive] = useState(false);
    const { language } = useContext(LanguageContext);
    const [isUploading, setIsUploading] = useState(false);
    const [youtubePlayer, setYoutubePlayer] = useState(null);
    const [isYTPlaying, setIsYTPlaying] = useState(false);
    const [isRetranscribing, setIsRetranscribing] = useState(false);
    const [videoPlaybackError, setVideoPlaybackError] = useState(false);
    const [autoTranscriptionTaskId, setAutoTranscriptionTaskId] =
        useState(null);
    const [retranscriptionTaskId, setRetranscriptionTaskId] = useState(null);
    const previousTranscriptCountRef = useRef(transcripts.length);
    const runTask = useRunTask();
    const { openNotifications } = useNotificationsContext();
    const { data: autoTranscriptionTask } = useTask(autoTranscriptionTaskId);
    const { data: retranscriptionTask } = useTask(retranscriptionTaskId);

    const showTranscriptionTaskError = useCallback(
        (task) => {
            const errorText = task?.statusText || task?.error;
            toast.error(
                getYouTubeTranscriptionAccessErrorMessage(errorText, t, {
                    url: task?.metadata?.url,
                }) ||
                    errorText ||
                    t("An error occurred. Please try again."),
            );
        },
        [t],
    );

    useEffect(() => {
        if (
            !autoTranscriptionTaskId ||
            !autoTranscriptionTask ||
            !TERMINAL_TASK_STATUSES.has(autoTranscriptionTask.status)
        ) {
            return;
        }

        if (autoTranscriptionTask.status === "completed") {
            setAutoTranscriptionTaskId(null);
            return;
        } else if (autoTranscriptionTask.status !== "cancelled") {
            setIsAutoTranscribing(false);
            showTranscriptionTaskError(autoTranscriptionTask);
        } else {
            setIsAutoTranscribing(false);
        }

        setAutoTranscriptionTaskId(null);
    }, [
        autoTranscriptionTask,
        autoTranscriptionTaskId,
        setIsAutoTranscribing,
        showTranscriptionTaskError,
    ]);

    useEffect(() => {
        if (
            !retranscriptionTaskId ||
            !retranscriptionTask ||
            !TERMINAL_TASK_STATUSES.has(retranscriptionTask.status)
        ) {
            return;
        }

        if (retranscriptionTask.status === "completed") {
            setRetranscriptionTaskId(null);
            return;
        } else if (retranscriptionTask.status !== "cancelled") {
            setIsRetranscribing(false);
            showTranscriptionTaskError(retranscriptionTask);
        } else {
            setIsRetranscribing(false);
        }

        setRetranscriptionTaskId(null);
    }, [
        retranscriptionTask,
        retranscriptionTaskId,
        showTranscriptionTaskError,
    ]);

    useEffect(() => {
        const previousCount = previousTranscriptCountRef.current;
        previousTranscriptCountRef.current = transcripts.length;

        if (transcripts.length > previousCount) {
            setIsAutoTranscribing(false);
            setIsRetranscribing(false);
        }
    }, [setIsAutoTranscribing, transcripts.length]);

    // Update the ref whenever transcripts changes
    useEffect(() => {
        transcriptsRef.current = transcripts;
    }, [transcripts]);

    useEffect(() => {
        activeTranscriptRef.current = activeTranscript;
    }, [activeTranscript]);

    useEffect(() => {
        videoInformationRef.current = userState?.transcribe?.videoInformation;
    }, [userState?.transcribe?.videoInformation]);

    useEffect(() => {
        videoLanguagesRef.current = videoLanguages;
    }, [videoLanguages]);

    const activeSubtitleTrack = transcripts[activeTranscript] || null;
    const isActiveLiveSubtitleTrack =
        activeSubtitleTrack?.isLive &&
        activeSubtitleTrack?.showOnVideo !== false;
    const liveOverlayTrack =
        isActiveLiveSubtitleTrack &&
        activeSubtitleTrack?.liveTrackId !== clearedLiveTrackId
            ? activeSubtitleTrack
            : null;
    const shouldSuppressPlayerSubtitle =
        suppressPlayerSubtitleForLive ||
        isActiveLiveSubtitleTrack ||
        activeSubtitleTrack?.liveTrackId === clearedLiveTrackId;
    const playerSubtitleTrack = shouldSuppressPlayerSubtitle
        ? null
        : activeSubtitleTrack;
    const playerSubtitleTrackIdentity =
        playerSubtitleTrack?.format === "vtt"
            ? playerSubtitleTrack.liveTrackId ||
              `${activeTranscript}:${playerSubtitleTrack.name || ""}:${
                  playerSubtitleTrack.timestamp || ""
              }`
            : null;
    const playerSubtitleTrackKey = playerSubtitleTrackIdentity
        ? `${playerSubtitleTrackIdentity}:${getTextRevisionKey(
              playerSubtitleTrack.text,
          )}`
        : null;
    const vttUrl =
        vttSource?.key === playerSubtitleTrackKey ? vttSource.url : null;

    // Handle VTT URL creation and cleanup
    useEffect(() => {
        if (playerSubtitleTrack?.format === "vtt" && playerSubtitleTrackKey) {
            const file = new Blob([playerSubtitleTrack.text], {
                type: "text/plain",
            });
            const url = URL.createObjectURL(file);
            setVttSource({ key: playerSubtitleTrackKey, url });

            return () => {
                URL.revokeObjectURL(url);
            };
        } else {
            setVttSource(null);
        }
    }, [
        playerSubtitleTrack?.format,
        playerSubtitleTrack?.text,
        playerSubtitleTrackKey,
    ]);

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
        (updates, { immediate = false } = {}) => {
            const nextState = {
                transcribe: {
                    ...userState?.transcribe,
                    ...updates,
                },
            };
            const update = immediate
                ? updateUserStateNow || debouncedUpdateUserState
                : debouncedUpdateUserState;
            return update(nextState);
        },
        [userState?.transcribe, debouncedUpdateUserState, updateUserStateNow],
    );

    const clearVideoInformation = () => {
        videoInformationRef.current = null;
        transcriptsRef.current = [];
        activeTranscriptRef.current = 0;
        setVideoInformation("");
        setUrl("");
        setTranscripts([]);
        setVideoLanguages([]);
        setActiveLanguage(0);
        updateUserState(
            {
                url: "",
                videoInformation: null,
                transcripts: [],
                videoLanguages: [],
            },
            { immediate: true },
        );
    };

    useEffect(() => {
        if (userState) {
            const nextVideoInformation = userState.transcribe?.videoInformation;
            if (
                userState.transcribe?.url !==
                prevUserStateRef.current?.transcribe?.url
            ) {
                setUrl(userState.transcribe?.url);
            }
            if (
                nextVideoInformation?.videoUrl !==
                prevUserStateRef.current?.transcribe?.videoInformation?.videoUrl
            ) {
                setVideoInformation(nextVideoInformation);
            }

            const nextVideoLanguages = getNormalizedVideoLanguages(
                nextVideoInformation,
                nextVideoInformation?.videoLanguages,
                t,
            );
            if (
                !areVideoLanguagesEqual(
                    nextVideoLanguages,
                    videoLanguagesRef.current,
                )
            ) {
                setVideoLanguages(nextVideoLanguages);
            } else if (
                nextVideoInformation?.videoLanguages?.length !==
                prevUserStateRef.current?.transcribe?.videoInformation
                    ?.videoLanguages?.length
            ) {
                videoLanguagesRef.current = nextVideoLanguages;
            }

            if (
                userState.transcribe?.transcripts?.length !==
                prevUserStateRef.current?.transcribe?.transcripts?.length
            ) {
                setTranscripts(
                    (userState.transcribe?.transcripts || []).map((track) =>
                        track?.isLive && !liveSessionActive
                            ? {
                                  ...track,
                                  isLive: false,
                                  liveStatus: "interrupted",
                              }
                            : track,
                    ),
                );
            }

            if (
                userState.transcribe?.activeTranscript !== undefined &&
                userState.transcribe?.activeTranscript !==
                    prevUserStateRef.current?.transcribe?.activeTranscript
            ) {
                const transcriptsArray =
                    userState.transcribe?.transcripts || [];
                const requestedIndex = userState.transcribe.activeTranscript;

                // Ensure the index is valid
                if (
                    requestedIndex < transcriptsArray.length &&
                    transcriptsArray[requestedIndex]
                ) {
                    setActiveTranscript(requestedIndex);
                } else if (transcriptsArray.length > 0) {
                    // If invalid but we have transcripts, set to first one
                    setActiveTranscript(0);
                    // Update stored state as well
                    updateUserState({
                        activeTranscript: 0,
                    });
                }
            }

            prevUserStateRef.current = userState;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userState]);

    useEffect(() => {
        const nextVideoLanguages = getNormalizedVideoLanguages(
            videoInformation,
            getVideoLanguagesForVideo(
                videoInformation,
                videoLanguagesRef.current,
            ),
            t,
        );

        if (
            videoInformation?.videoUrl &&
            !areVideoLanguagesEqual(
                nextVideoLanguages,
                videoLanguagesRef.current,
            )
        ) {
            setVideoLanguages(nextVideoLanguages);
            setActiveLanguage(0);

            updateUserState({
                videoInformation: {
                    ...videoInformation,
                    videoLanguages: nextVideoLanguages,
                },
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoInformation]);

    useEffect(() => {
        if (videoInformation) {
            updateUserState({
                videoInformation: videoInformationRef.current,
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
            const nextVideoLanguages = getNormalizedVideoLanguages(
                videoInformation,
                getVideoLanguagesForVideo(videoInformation, videoLanguages),
                t,
            );
            if (!areVideoLanguagesEqual(nextVideoLanguages, videoLanguages)) {
                setVideoLanguages(nextVideoLanguages);
                return;
            }

            updateUserState({
                videoInformation: {
                    ...videoInformation,
                    videoLanguages: nextVideoLanguages,
                },
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoLanguages, videoInformation]);

    const addSubtitleTrack = useCallback(
        (transcript) => {
            if (transcript) {
                const { text, format, name } = transcript;

                // First, calculate the new transcript data outside of setState
                // This ensures we have the data even if component unmounts
                const calculateNewTranscripts = (prevTranscripts) => {
                    // Find existing tracks with the same name and get the highest number
                    const baseNameMatch = name.match(/(.*?)(?:\s+\((\d+)\))?$/);
                    const baseName = baseNameMatch[1];
                    const escapedBaseName = escapeRegExp(baseName);
                    const existingNumbers = prevTranscripts
                        .filter((t) => t.name && t.name.startsWith(baseName))
                        .map((t) => {
                            const match = t.name.match(
                                new RegExp(
                                    `${escapedBaseName}\\s+\\((\\d+)\\)$`,
                                ),
                            );
                            return match ? parseInt(match[1]) : 0;
                        });

                    // Determine the new name with suffix if needed
                    let newName = name;
                    if (prevTranscripts.some((t) => t.name === name)) {
                        const nextNumber =
                            existingNumbers.length > 0
                                ? Math.max(...existingNumbers) + 1
                                : 1;
                        newName = `${baseName} (${nextNumber})`;
                    }

                    return [
                        ...prevTranscripts,
                        {
                            text,
                            format,
                            name: newName,
                            timestamp: new Date().toISOString(),
                        },
                    ];
                };

                // Use the ref to get the current transcripts
                const currentTranscripts = transcriptsRef.current || [];
                const updatedTranscripts =
                    calculateNewTranscripts(currentTranscripts);
                const newActiveIndex = updatedTranscripts.length - 1;

                // Update component state (this might not execute if component unmounts)
                setTranscripts(updatedTranscripts);
                setActiveTranscript(newActiveIndex);

                // Always update user state regardless of component mount status
                updateUserState({
                    videoInformation: videoInformationRef.current,
                    transcripts: updatedTranscripts,
                    activeTranscript: newActiveIndex,
                });
            }
            setAddTrackDialogOpen(false);
        },
        [updateUserState],
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
                const videoElement = videoElementRef.current;
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
        // Ensure index is valid or default to 0
        const validIndex = index >= 0 && index < transcripts.length ? index : 0;

        setClearedLiveTrackId(null);
        setActiveTranscript(validIndex);
        activeTranscriptRef.current = validIndex;
        updateUserState({
            activeTranscript: validIndex,
        });
    };

    const updateLiveSubtitleTrack = useCallback(
        (track, { activate = false } = {}) => {
            if (!track?.liveTrackId || !videoInformationRef.current?.videoUrl) {
                return;
            }

            const currentTranscripts = transcriptsRef.current || [];
            const existingIndex = currentTranscripts.findIndex(
                (transcript) => transcript.liveTrackId === track.liveTrackId,
            );
            const nextTrack = {
                ...(existingIndex >= 0
                    ? currentTranscripts[existingIndex]
                    : {}),
                ...track,
                timestamp:
                    (existingIndex >= 0
                        ? currentTranscripts[existingIndex]?.timestamp
                        : null) ||
                    track.timestamp ||
                    new Date().toISOString(),
            };
            const updatedTranscripts =
                existingIndex >= 0
                    ? currentTranscripts.map((transcript, index) =>
                          index === existingIndex ? nextTrack : transcript,
                      )
                    : [...currentTranscripts, nextTrack];
            const liveTrackIndex =
                existingIndex >= 0
                    ? existingIndex
                    : updatedTranscripts.length - 1;
            const nextActiveTranscript = activate
                ? liveTrackIndex
                : activeTranscriptRef.current;

            transcriptsRef.current = updatedTranscripts;
            setTranscripts(updatedTranscripts);

            if (activate) {
                setClearedLiveTrackId(null);
                setIsEditing(false);
                setActiveTranscript(liveTrackIndex);
                activeTranscriptRef.current = liveTrackIndex;
            }

            updateUserState({
                videoInformation: videoInformationRef.current,
                transcripts: updatedTranscripts,
                activeTranscript: nextActiveTranscript,
            });
        },
        [updateUserState],
    );

    const selectLiveSubtitleTrack = useCallback(
        (liveTrackId) => {
            const trackIndex = (transcriptsRef.current || []).findIndex(
                (transcript) => transcript.liveTrackId === liveTrackId,
            );
            if (trackIndex < 0) return;

            setClearedLiveTrackId(null);
            setSuppressPlayerSubtitleForLive(false);
            setIsEditing(false);
            setActiveTranscript(trackIndex);
            activeTranscriptRef.current = trackIndex;
            updateUserState({
                activeTranscript: trackIndex,
            });
        },
        [updateUserState],
    );

    const clearActiveLiveSubtitleTrack = useCallback((liveTrackId) => {
        const activeTrack =
            (transcriptsRef.current || [])[activeTranscriptRef.current] || null;
        if (!liveTrackId || activeTrack?.liveTrackId !== liveTrackId) return;

        setClearedLiveTrackId(liveTrackId);
        setSuppressPlayerSubtitleForLive(false);
    }, []);

    const handleLiveSessionActiveChange = useCallback((active) => {
        setSuppressPlayerSubtitleForLive(active);
        setLiveSessionActive(active);
    }, []);

    // Add function to start transcription
    const startTranscription = useCallback(async () => {
        const videoUrl =
            videoInformation?.transcriptionUrl || videoInformation?.videoUrl;
        if (!videoUrl) return;

        try {
            setIsAutoTranscribing(true);
            const modelOption = getDefaultTranscribeModelOption(
                videoUrl,
                xaiTranscribeEnabled,
                xaiTranscribeDefaultEnabled,
                transcribeDefaultModelOption,
            );
            await updateUserState(
                {
                    url: videoInformation?.videoUrl || videoUrl,
                    videoInformation:
                        videoInformationRef.current || videoInformation,
                    transcripts,
                },
                { immediate: true },
            );

            const { taskId } = await runTask.mutateAsync({
                type: "transcribe",
                url: videoUrl,
                language: "",
                wordTimestamped: false,
                responseFormat: "vtt",
                modelOption,
                source: "video_page",
            });

            if (taskId) {
                setAutoTranscriptionTaskId(taskId);
            } else {
                setIsAutoTranscribing(false);
            }
        } catch (error) {
            console.error("Auto-transcription error:", error);
            toast.error(
                getYouTubeTranscriptionAccessErrorMessage(error, t, {
                    url: videoUrl,
                }) || t("An error occurred. Please try again."),
            );
            setIsAutoTranscribing(false);
        }
    }, [
        videoInformation,
        t,
        setIsAutoTranscribing,
        runTask,
        updateUserState,
        transcripts,
        xaiTranscribeEnabled,
        xaiTranscribeDefaultEnabled,
        transcribeDefaultModelOption,
    ]);

    // Effect to trigger initial processing (YT subtitles or transcription)
    useEffect(() => {
        const videoUrl = videoInformation?.videoUrl;
        if (videoUrl && !transcripts.length && !attemptedAutoTranscribe) {
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

    // Modify the retranscription function to create a new track instead of updating existing
    const handleRetranscribe = useCallback(async () => {
        const videoUrl =
            videoInformation?.transcriptionUrl || videoInformation?.videoUrl;
        if (!videoUrl || isRetranscribing) return;

        try {
            setIsRetranscribing(true);
            const modelOption = getAlternateTranscribeModelOption(
                videoUrl,
                transcribeAlternateModelOption,
            );

            // Get current transcript format
            const currentTranscript = transcripts[activeTranscript];
            if (!currentTranscript) {
                setIsRetranscribing(false);
                return;
            }

            const isFormatted =
                currentTranscript.format !== "vtt" &&
                currentTranscript.format !== "";
            const isWordTimestamped =
                currentTranscript.text?.includes("<c.") ||
                (currentTranscript.format === "vtt" &&
                    currentTranscript.text?.includes("<c "));
            const responseFormat = isFormatted
                ? "formatted"
                : currentTranscript.format === ""
                  ? "text"
                  : currentTranscript.format;
            const currentName =
                currentTranscript.name || `Transcript ${activeTranscript + 1}`;
            await updateUserState(
                {
                    url: videoInformation?.videoUrl || videoUrl,
                    videoInformation:
                        videoInformationRef.current || videoInformation,
                    transcripts,
                    activeTranscript,
                },
                { immediate: true },
            );

            const { taskId } = await runTask.mutateAsync({
                type: "transcribe",
                url: videoUrl,
                language: "",
                wordTimestamped: isWordTimestamped,
                responseFormat,
                modelOption,
                trackName: `${currentName} (alternative)`,
                isAlternative: true,
                source: "video_page",
            });

            if (taskId) {
                setRetranscriptionTaskId(taskId);
                openNotifications();
            } else {
                setIsRetranscribing(false);
            }
        } catch (error) {
            console.error("Re-transcription error:", error);
            toast.error(
                getYouTubeTranscriptionAccessErrorMessage(error, t, {
                    url: videoUrl,
                }) || t("An error occurred. Please try again."),
            );
            setIsRetranscribing(false);
        }
    }, [
        videoInformation,
        isRetranscribing,
        transcripts,
        activeTranscript,
        t,
        transcribeAlternateModelOption,
        runTask,
        openNotifications,
        updateUserState,
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

    const activeLiveTrackId = activeSubtitleTrack?.liveTrackId;
    const liveDisabledReason = isYoutubeUrl(videoInformation?.videoUrl)
        ? t("Live capture needs a direct audio or video file.")
        : videoPlaybackError
          ? t("Video Unavailable")
          : null;

    return (
        <TranscribeErrorBoundary>
            <div>
                <PageHeader title={t("Transcription and translation")}>
                    <HeaderAction
                        icon={RefreshCwIcon}
                        label={t("Start over")}
                        onClick={() => {
                            if (
                                window.confirm(
                                    t("Are you sure you want to start over?"),
                                )
                            ) {
                                markAttempted(false);
                                clearVideoInformation();
                            }
                        }}
                    />
                </PageHeader>
                <div>
                    <div className="video-player-container overflow-hidden mb-4">
                        {isValidUrl(videoInformation?.videoUrl) ? (
                            <>
                                <div className="flex gap-4 flex-col sm:flex-row">
                                    <div className="sm:w-[calc(100%-13rem)] flex flex-col gap-3">
                                        <VideoPlayer
                                            mediaElementRef={videoElementRef}
                                            setYoutubePlayer={setYoutubePlayer}
                                            videoLanguages={videoLanguages}
                                            activeLanguage={activeLanguage}
                                            onTimeUpdate={setCurrentTime}
                                            currentTime={currentTime}
                                            vttUrl={vttUrl}
                                            vttKey={playerSubtitleTrackKey}
                                            activeSubtitleTrack={
                                                playerSubtitleTrack
                                            }
                                            liveOverlayTrack={liveOverlayTrack}
                                            videoInformation={videoInformation}
                                            copied={copied}
                                            handleCopy={handleCopy}
                                            onPlaybackErrorChange={
                                                setVideoPlaybackError
                                            }
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

                                                    return (
                                                        <div className="border rounded-lg border-gray-200/50 dark:border-gray-600/50 p-3 space-y-3">
                                                            <div className="text-sm text-sky-600 font-semibold flex items-center gap-2">
                                                                <Volume2Icon className="h-4 w-4" />
                                                                {t(
                                                                    "Audio tracks",
                                                                )}
                                                            </div>

                                                            {/* Mobile Select View */}
                                                            <div className="sm:hidden">
                                                                <Select
                                                                    disabled={
                                                                        liveSessionActive
                                                                    }
                                                                    value={activeLanguage.toString()}
                                                                    onValueChange={(
                                                                        value,
                                                                    ) =>
                                                                        setActiveLanguage(
                                                                            parseInt(
                                                                                value,
                                                                            ),
                                                                        )
                                                                    }
                                                                >
                                                                    <SelectTrigger className="w-full text-xs">
                                                                        <SelectValue>
                                                                            {videoLanguages[
                                                                                activeLanguage
                                                                            ]
                                                                                ?.label ||
                                                                                new Intl.DisplayNames(
                                                                                    [
                                                                                        language,
                                                                                    ],
                                                                                    {
                                                                                        type: "language",
                                                                                    },
                                                                                ).of(
                                                                                    videoLanguages[
                                                                                        activeLanguage
                                                                                    ]
                                                                                        ?.code ||
                                                                                        "en",
                                                                                )}
                                                                        </SelectValue>
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {videoLanguages.map(
                                                                            (
                                                                                lang,
                                                                                idx,
                                                                            ) => (
                                                                                <SelectItem
                                                                                    key={
                                                                                        idx
                                                                                    }
                                                                                    value={idx.toString()}
                                                                                    className="text-xs"
                                                                                >
                                                                                    <div className="flex items-center justify-between w-full">
                                                                                        <span>
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
                                                                                        </span>
                                                                                        <div className="flex items-center gap-2">
                                                                                            {idx !==
                                                                                                0 && (
                                                                                                <button
                                                                                                    disabled={
                                                                                                        liveSessionActive
                                                                                                    }
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
                                                                                                    className="text-gray-500 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                                                                                                >
                                                                                                    <TrashIcon className="h-3 w-3" />
                                                                                                </button>
                                                                                            )}
                                                                                            <a
                                                                                                href={
                                                                                                    lang.url
                                                                                                }
                                                                                                download={`video-${lang.code}.mp4`}
                                                                                                onClick={(
                                                                                                    e,
                                                                                                ) =>
                                                                                                    e.stopPropagation()
                                                                                                }
                                                                                                className="text-gray-500"
                                                                                            >
                                                                                                <DownloadIcon className="h-3.5 w-3.5" />
                                                                                            </a>
                                                                                        </div>
                                                                                    </div>
                                                                                </SelectItem>
                                                                            ),
                                                                        )}
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>

                                                            {/* Desktop List View */}
                                                            <div className="hidden sm:flex sm:flex-col sm:gap-2">
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
                                                                            <div className="flex w-[13rem] rounded-md border border-gray-200 dark:border-gray-600 overflow-hidden">
                                                                                <button
                                                                                    disabled={
                                                                                        liveSessionActive
                                                                                    }
                                                                                    onClick={() => {
                                                                                        setActiveLanguage(
                                                                                            idx,
                                                                                        );
                                                                                    }}
                                                                                    className={`grow truncate text-start text-xs px-3 py-1.5 hover:bg-sky-100 active:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50 transition-colors
                                                                            ${activeLanguage === idx ? "bg-sky-50 dark:bg-sky-900/20 text-gray-900 dark:text-gray-100" : "text-gray-600 dark:text-gray-400"}`}
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
                                                                                                disabled={
                                                                                                    liveSessionActive
                                                                                                }
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
                                                                                                className="px-2 bg-sky-50 dark:bg-sky-900/20 text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors border-gray-200 dark:border-gray-600 flex items-center cursor-pointer"
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
                                                                                        className="px-2 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors border-l border-gray-200 dark:border-gray-600 flex items-center cursor-pointer"
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

                                                            {!isAudioFile && (
                                                                <button
                                                                    disabled={
                                                                        liveSessionActive
                                                                    }
                                                                    onClick={() =>
                                                                        setShowTranslateDialog(
                                                                            true,
                                                                        )
                                                                    }
                                                                    className="lb-outline-secondary lb-sm flex items-center gap-1 w-full disabled:cursor-not-allowed disabled:opacity-50"
                                                                >
                                                                    <PlusIcon className="h-4 w-4" />
                                                                    {t(
                                                                        "Add audio track",
                                                                    )}
                                                                </button>
                                                            )}

                                                            <RealtimeAudioLiveControls
                                                                mediaElementRef={
                                                                    videoElementRef
                                                                }
                                                                realtimeAudio={
                                                                    realtimeAudio
                                                                }
                                                                disabledReason={
                                                                    liveDisabledReason
                                                                }
                                                                onLiveTrackUpdate={
                                                                    updateLiveSubtitleTrack
                                                                }
                                                                onSelectLiveTrack={
                                                                    selectLiveSubtitleTrack
                                                                }
                                                                onClearLiveTrack={
                                                                    clearActiveLiveSubtitleTrack
                                                                }
                                                                onLiveSessionActiveChange={
                                                                    handleLiveSessionActiveChange
                                                                }
                                                                activeLiveTrackId={
                                                                    activeLiveTrackId
                                                                }
                                                                activeLiveTrackRole={
                                                                    activeSubtitleTrack?.liveRole
                                                                }
                                                                className="border-t border-gray-200/70 pt-3 dark:border-gray-700"
                                                            />
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
                                            onQueued={() => {
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
                    videoInformation={videoInformation}
                    onAdd={addSubtitleTrack}
                    apolloClient={apolloClient}
                    addTrackDialogOpen={addTrackDialogOpen}
                    setAddTrackDialogOpen={setAddTrackDialogOpen}
                    selectedTab={selectedTab}
                    setSelectedTab={setSelectedTab}
                    isEditing={isEditing}
                    setIsEditing={setIsEditing}
                    onDeleteTrack={() => {
                        if (transcripts[activeTranscript || 0]?.isLive) return;
                        const updatedTranscripts = transcripts.filter(
                            (_, index) => index !== (activeTranscript || 0),
                        );

                        setTranscripts(updatedTranscripts);
                        const newActiveIndex = Math.max(
                            0,
                            activeTranscript - 1,
                        );
                        setActiveTranscript(newActiveIndex);
                        updateUserState({
                            videoInformation: {
                                ...videoInformationRef.current,
                                activeTranscript: newActiveIndex,
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
                                        videoInformation:
                                            videoInformationRef.current,
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
                                onRetranscribe={handleRetranscribe}
                                isRetranscribing={isRetranscribing}
                                showRetranscribeButton={
                                    !transcripts[activeTranscript]
                                        .isAlternative &&
                                    !transcripts[activeTranscript].isLive
                                }
                                url={videoInformation?.videoUrl || url}
                            />
                        </>
                    )}
            </div>
        </TranscribeErrorBoundary>
    );
}

export default VideoPage;
