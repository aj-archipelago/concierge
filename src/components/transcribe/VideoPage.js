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
import { useApolloClient } from "@apollo/client";
import dayjs from "dayjs";
import {
    CheckIcon,
    ChevronDown,
    CopyIcon,
    DownloadIcon,
    MoreVertical,
    PlusCircleIcon,
    PlusIcon,
    RefreshCwIcon,
    TrashIcon,
} from "lucide-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaEdit } from "react-icons/fa";
import ReactTimeAgo from "react-time-ago";
import classNames from "../../../app/utils/class-names";
import { AuthContext } from "../../App";
import LoadingButton from "../editor/LoadingButton";
import AzureVideoTranslate from "./AzureVideoTranslate";
import TranscribeErrorBoundary from "./ErrorBoundary";
import InitialView from "./InitialView";
import TaxonomySelector from "./TaxonomySelector";
import { AddTrackButton } from "./TranscriptionOptions";
import TranscriptView from "./TranscriptView";
import VideoInput from "./VideoInput";
import { LanguageContext } from "../../contexts/LanguageProvider";

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

    const convertVttToSrt = (vttText, includeNumbers = true) => {
        const lines = vttText.split("\n");
        let srtContent = "";
        let subtitleCount = 1;
        let currentSubtitle = {};

        lines.forEach((line) => {
            const timestampMatch = line.match(
                /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/,
            );
            if (timestampMatch) {
                if (currentSubtitle.timestamp) {
                    srtContent += includeNumbers ? `${subtitleCount}\n` : "";
                    srtContent += `${currentSubtitle.timestamp}\n${currentSubtitle.text}\n\n`;
                    subtitleCount++;
                }
                // Convert timestamp format from VTT to SRT (replace . with ,)
                currentSubtitle = {
                    timestamp: `${timestampMatch[1].replace(".", ",")} --> ${timestampMatch[2].replace(".", ",")}`,
                    text: "",
                };
            } else if (
                line.trim() &&
                !/^\d+$/.test(line) &&
                currentSubtitle.timestamp
            ) {
                currentSubtitle.text = (
                    currentSubtitle.text +
                    " " +
                    line
                ).trim();
            }
        });

        // Add the last subtitle
        if (currentSubtitle.timestamp) {
            srtContent += includeNumbers ? `${subtitleCount}\n` : "";
            srtContent += `${currentSubtitle.timestamp}\n${currentSubtitle.text}\n\n`;
        }

        return srtContent.trim();
    };

    const downloadFile = (selectedFormat) => {
        let downloadText = text;

        // Convert format if needed
        if (selectedFormat === "srt") {
            downloadText = convertVttToSrt(text, true);
        } else if (selectedFormat === "srt-no-numbers") {
            downloadText = convertVttToSrt(text, false);
        }

        const element = document.createElement("a");
        const file = new Blob([downloadText], { type: "text/plain" });
        element.href = URL.createObjectURL(file);
        const fileExt =
            selectedFormat === "srt-no-numbers" ? "srt" : selectedFormat;
        element.download = `${name}_sub.${fileExt}`;
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
                        onClick={() => downloadFile("srt-no-numbers")}
                    >
                        {t("Download Plain SRT")}
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
        // return add track button
        return (
            <AddTrackButton
                transcripts={transcripts}
                url={url}
                onAdd={onAdd}
                activeTranscript={activeTranscript}
                trigger={
                    <button className="lb-outline-secondary flex items-center gap-1 text-xs">
                        {t("Add subtitles or transcript")}
                    </button>
                }
                apolloClient={apolloClient}
                addTrackDialogOpen={addTrackDialogOpen}
                setAddTrackDialogOpen={setAddTrackDialogOpen}
                selectedTab={selectedTab}
                setSelectedTab={setSelectedTab}
            />
        );
    }

    return (
        <div className="mb-2">
            {editing ? (
                <div className="flex gap-2">
                    <input
                        autoFocus
                        type="text"
                        className="text-md w-[300px] font-medium rounded-md py-1.5 my-[1px] px-3 border border-gray-300"
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
                <div className="flex flex-col md:flex-row gap-2 justify-between ">
                    <div className="flex gap-2 grow">
                        <Select
                            value={activeTranscript.toString()}
                            onValueChange={(value) =>
                                setActiveTranscript(parseInt(value))
                            }
                        >
                            <SelectTrigger className="w-[300px] py-1 text-md font-medium text-start">
                                <SelectValue>
                                    {transcripts[activeTranscript]?.name ||
                                        `Transcript ${activeTranscript + 1}`}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="overflow-hidden">
                                {transcripts.map((transcript, index) => (
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
                                                    {transcripts[index]
                                                        .format === "vtt"
                                                        ? t("Subtitles")
                                                        : t("Transcript")}
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
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="flex gap-2 items-center">
                            <AddTrackButton
                                transcripts={transcripts}
                                url={url}
                                onAdd={onAdd}
                                activeTranscript={activeTranscript}
                                trigger={
                                    <button className="flex items-center text-sky-600 hover:text-sky-700">
                                        <PlusCircleIcon className="h-6 w-6" />{" "}
                                        {transcripts.length > 0
                                            ? t("")
                                            : t("Add subtitles or transcript")}
                                    </button>
                                }
                                apolloClient={apolloClient}
                                addTrackDialogOpen={addTrackDialogOpen}
                                setAddTrackDialogOpen={setAddTrackDialogOpen}
                                selectedTab={selectedTab}
                                setSelectedTab={setSelectedTab}
                            />
                        </div>
                    </div>
                    {!isEditing && transcripts[activeTranscript] && (
                        <div className="flex items-center gap-2 justify-end">
                            {transcripts[activeTranscript].format !== "vtt" && (
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
                                format={transcripts[activeTranscript].format}
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
    activeLanguage,
    transcripts,
    activeTranscript,
    onTimeUpdate,
    videoInformation,
    vttUrl,
}) {
    const [isAudioOnly, setIsAudioOnly] = useState(false);
    const videoRef = useRef(null);

    const handleVideoReady = () => {
        if (videoRef.current && videoRef.current.videoHeight === 0) {
            setIsAudioOnly(true);
        } else {
            setIsAudioOnly(false);
        }
    };

    return (
        <>
            <div
                className={classNames(
                    "rounded-lg flex justify-center items-center border border-gray-200/50",
                    isAudioOnly
                        ? "h-[50px] w-96"
                        : "grow max-h-[40vh] bg-[#000]",
                )}
            >
                <video
                    className={`rounded-lg ${isAudioOnly ? "h-[50px] w-96" : "grow max-h-[40vh]"}`}
                    ref={videoRef}
                    src={videoLanguages[activeLanguage]?.url}
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
            </div>
        </>
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
            debouncedUpdateUserState({
                transcribe: {
                    ...userState?.transcribe,
                    ...updates,
                },
            });
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
                if (userState.transcribe?.videoInformation?.videoLanguages) {
                    setVideoLanguages(
                        userState.transcribe.videoInformation.videoLanguages,
                    );
                }
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

            updateUserState({
                videoInformation: {
                    ...userState?.transcribe?.videoInformation,
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
                    ...userState?.transcribe?.videoInformation,
                    transcripts,
                },
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transcripts]);

    useEffect(() => {
        if (videoInformation) {
            updateUserState({
                videoInformation: {
                    ...userState?.transcribe?.videoInformation,
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
                        .filter(t => t.name && t.name.startsWith(baseName))
                        .map(t => {
                            const match = t.name.match(new RegExp(`${baseName}\\s+\\((\\d+)\\)$`));
                            return match ? parseInt(match[1]) : 0;
                        });
                    
                    // Determine the new name with suffix if needed
                    let newName = name;
                    if (prev.some(t => t.name === name)) {
                        const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
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

    const handleSeek = useCallback((time) => {
        const videoElement = document.querySelector("video");
        if (videoElement) {
            videoElement.currentTime = time;
        }
    }, []);

    const handleActiveTranscriptChange = (index) => {
        setActiveTranscript(index);
        updateUserState({
            activeTranscript: index,
        });
    };

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
            <div className="p-2">
                <div className="flex flex-col gap-4 mb-4">
                    <div className="flex gap-4 justify-between">
                        <div className="grow min-w-0 sm:w-[calc(100%-13rem)] sm:grow-0">
                            {videoInformation?.videoUrl && (
                                <div className="flex gap-2 items-center py-1 px-2 bg-gray-100 rounded-md grow min-w-0">
                                    <div className="text-xs text-gray-500 truncate">
                                        {videoLanguages[activeLanguage]?.url ||
                                            videoInformation.videoUrl}
                                    </div>
                                    <button
                                        onClick={() =>
                                            handleCopy(
                                                videoLanguages[activeLanguage]
                                                    ?.url ||
                                                    videoInformation.videoUrl,
                                            )
                                        }
                                        className="p-1 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                                        title="Copy URL"
                                    >
                                        {copied ? (
                                            <CheckIcon className="h-4 w-4 text-green-500" />
                                        ) : (
                                            <CopyIcon className="h-4 w-4 text-gray-500" />
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="flex-shrink-0 sm:w-[13rem] flex justify-end">
                            <button
                                onClick={() => {
                                    if (
                                        window.confirm(
                                            t(
                                                "Are you sure you want to start over?",
                                            ),
                                        )
                                    ) {
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
                <div>
                    <div className="video-player-container overflow-hidden mb-4">
                        {isValidUrl(videoInformation?.videoUrl) ? (
                            <>
                                <div className="flex gap-4 flex-col sm:flex-row">
                                    <div className="sm:w-[calc(100%-13rem)]">
                                        <VideoPlayer
                                            videoLanguages={videoLanguages}
                                            activeLanguage={activeLanguage}
                                            transcripts={transcripts}
                                            activeTranscript={activeTranscript}
                                            onTimeUpdate={setCurrentTime}
                                            videoInformation={videoInformation}
                                            vttUrl={vttUrl}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2 sm:w-[13rem]">
                                        <div className="border rounded-lg border-gray-200/50 p-3 space-y-3">
                                            <div className="text-sm font-semibold text-gray-500">
                                                {t("Video languages")}
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                {videoLanguages.map(
                                                    (lang, idx) => (
                                                        <div
                                                            key={idx}
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
                                                                    {lang.label}
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
                                                                                className={
                                                                                    "px-2 bg-sky-50 text-gray-500 hover:text-red-500 transition-colors border-gray-200 flex items-center cursor-pointer"
                                                                                }
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
                                                    setShowTranslateDialog(true)
                                                }
                                                className="lb-outline-secondary lb-sm flex items-center gap-1 w-full"
                                            >
                                                <PlusIcon className="h-4 w-4" />
                                                {t("Add translation")}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <Dialog
                                    open={showTranslateDialog}
                                    onOpenChange={setShowTranslateDialog}
                                >
                                    <DialogContent className="max-w-3xl">
                                        <DialogHeader>
                                            <DialogTitle>
                                                {t("Add Video Language")}
                                            </DialogTitle>
                                            <DialogDescription>
                                                {t(
                                                    "Translate this video into another language using Azure's video translation service.",
                                                )}
                                            </DialogDescription>
                                        </DialogHeader>
                                        <AzureVideoTranslate
                                            url={videoInformation?.videoUrl}
                                            onComplete={async (
                                                targetLocale,
                                                outputUrl,
                                                vttUrls,
                                            ) => {
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
                                                        if (!vttUrl) {
                                                            return null;
                                                        }
                                                        const response =
                                                            await fetch(vttUrl);
                                                        const vttContent =
                                                            await response.text();

                                                        return {
                                                            url: vttUrl,
                                                            text: vttContent,
                                                            format: "vtt",
                                                            name,
                                                        };
                                                    };

                                                    const newVideoLanguages = [
                                                        ...videoLanguages,
                                                        {
                                                            code: targetLocale,
                                                            label: new Intl.DisplayNames(
                                                                [language],
                                                                {
                                                                    type: "language",
                                                                },
                                                            ).of(targetLocale),
                                                            url: outputUrl,
                                                        },
                                                    ];

                                                    let newTranscripts = [
                                                        ...transcripts,
                                                    ];

                                                    // Try to add original subtitles if they don't exist
                                                    try {
                                                        const autoSubtitlesExist =
                                                            transcripts.some(
                                                                (transcript) =>
                                                                    transcript.name ===
                                                                    t(
                                                                        "Original Subtitles",
                                                                    ),
                                                            );

                                                        if (
                                                            !autoSubtitlesExist &&
                                                            originalVttUrl
                                                        ) {
                                                            const originalTranscript =
                                                                await addVtt(
                                                                    originalVttUrl,
                                                                    t(
                                                                        "Original Subtitles",
                                                                    ),
                                                                );
                                                            if (
                                                                originalTranscript
                                                            ) {
                                                                newTranscripts.push(
                                                                    originalTranscript,
                                                                );
                                                            }
                                                        }
                                                    } catch (error) {
                                                        console.error(
                                                            "Failed to fetch original VTT content:",
                                                            error,
                                                        );
                                                        // Continue with translation even if original subtitles fail
                                                    }

                                                    // Try to add translated subtitles
                                                    try {
                                                        if (translatedVttUrl) {
                                                            const translatedTranscript =
                                                                await addVtt(
                                                                    translatedVttUrl,
                                                                    t(
                                                                        "{{language}} Subtitles",
                                                                        {
                                                                            language:
                                                                                new Intl.DisplayNames(
                                                                                    [
                                                                                        language,
                                                                                    ],
                                                                                    {
                                                                                        type: "language",
                                                                                    },
                                                                                ).of(
                                                                                    targetLocale,
                                                                                ),
                                                                        },
                                                                    ),
                                                                );
                                                            if (
                                                                translatedTranscript
                                                            ) {
                                                                newTranscripts.push(
                                                                    translatedTranscript,
                                                                );
                                                            }
                                                        }
                                                    } catch (error) {
                                                        console.error(
                                                            "Failed to fetch translated VTT content:",
                                                            error,
                                                        );
                                                    }

                                                    // Update state with whatever we successfully got
                                                    setTranscripts(
                                                        newTranscripts,
                                                    );
                                                    setVideoLanguages(
                                                        newVideoLanguages,
                                                    );
                                                    setActiveLanguage(
                                                        newVideoLanguages.length -
                                                            1,
                                                    );
                                                    setActiveTranscript(
                                                        newTranscripts.length -
                                                            1,
                                                    );
                                                    updateUserState({
                                                        videoInformation: {
                                                            ...userState
                                                                ?.transcribe
                                                                ?.videoInformation,
                                                            videoLanguages:
                                                                newVideoLanguages,
                                                        },
                                                        transcripts:
                                                            newTranscripts,
                                                        activeTranscript:
                                                            newTranscripts.length -
                                                            1,
                                                    });

                                                    setShowTranslateDialog(
                                                        false,
                                                    );
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
                            (_, index) => index !== activeTranscript,
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
