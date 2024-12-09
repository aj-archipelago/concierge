"use client";

import {
    Dialog,
    DialogContent,
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
import { ChevronDown, DownloadIcon, MoreVertical } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaEdit } from "react-icons/fa";
import CopyButton from "../CopyButton";
import LoadingButton from "../editor/LoadingButton";
import TaxonomySelector from "./TaxonomySelector";

// Simplified VTT component
function VttSubtitles({ text, onSeek, currentTime }) {
    const containerRef = useRef(null);
    const lines = text.split("\n");
    const subtitles = [];
    let currentSubtitle = {};

    // Parse VTT content into structured data
    lines.forEach((line) => {
        const timestampMatch = line.match(
            /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/,
        );
        if (timestampMatch) {
            if (currentSubtitle.timestamp) {
                subtitles.push(currentSubtitle);
            }
            currentSubtitle = {
                timestamp: timestampMatch[1],
                text: "",
            };
        } else if (line.trim() && currentSubtitle.timestamp) {
            currentSubtitle.text = (currentSubtitle.text + " " + line).trim();
        }
    });
    if (currentSubtitle.timestamp) {
        subtitles.push(currentSubtitle);
    }

    // Add effect to handle scrolling when currentTime changes
    useEffect(() => {
        if (!containerRef.current || !currentTime) return;

        const subtitleElements =
            containerRef.current.getElementsByClassName("subtitle-row");
        let targetElement = null;

        // Find the last subtitle that starts before or at the current time
        for (let i = subtitleElements.length - 1; i >= 0; i--) {
            const element = subtitleElements[i];
            const timestamp = element.getAttribute("data-timestamp");
            const [hours, minutes, seconds] = timestamp.split(":");
            const timestampSeconds =
                parseInt(hours) * 3600 +
                parseInt(minutes) * 60 +
                parseFloat(seconds);

            if (timestampSeconds <= currentTime) {
                targetElement = element;
                break;
            }
        }

        // Scroll to the found element
        if (targetElement) {
            const container = containerRef.current;
            const elementTop = targetElement.offsetTop;
            container.scrollTo({
                top: elementTop - container.offsetTop,
                behavior: "smooth",
            });
        }
    }, [currentTime]);

    const handleTimestampClick = (timestamp) => {
        const [hours, minutes, seconds] = timestamp.split(":");
        const totalSeconds =
            parseInt(hours) * 3600 +
            parseInt(minutes) * 60 +
            parseFloat(seconds);

        if (onSeek) {
            onSeek(totalSeconds);
        }
    };

    // If no timestamps were found, return raw text
    if (subtitles.length === 0) {
        return <div className="whitespace-pre-wrap text-sm">{text}</div>;
    }

    return (
        <div
            ref={containerRef}
            className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 overflow-y-auto max-h-[500px] text-sm"
        >
            {subtitles.map((subtitle, index) => (
                <React.Fragment key={index}>
                    <div
                        className="subtitle-row"
                        data-timestamp={subtitle.timestamp}
                    >
                        <a
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                handleTimestampClick(subtitle.timestamp);
                            }}
                            className="text-blue-600 hover:text-blue-800"
                        >
                            {subtitle.timestamp}
                        </a>
                    </div>
                    <div className="text-sm">{subtitle.text}</div>
                </React.Fragment>
            ))}
        </div>
    );
}

// New SRT component
function SrtSubtitles({ text, onSeek, currentTime, onSubtitleChange }) {
    const containerRef = useRef(null);

    console.log("text", text);

    // Same scrolling effect as VTT
    useEffect(() => {
        if (!containerRef.current || !currentTime) return;

        const subtitleElements =
            containerRef.current.getElementsByClassName("subtitle-row");
        let targetElement = null;

        for (let i = subtitleElements.length - 1; i >= 0; i--) {
            const element = subtitleElements[i];
            const timestamp = element.getAttribute("data-timestamp");
            const [hours, minutes, seconds] = timestamp.split(":");
            const timestampSeconds =
                parseInt(hours) * 3600 +
                parseInt(minutes) * 60 +
                parseFloat(seconds);

            if (timestampSeconds <= currentTime) {
                targetElement = element;
                break;
            }
        }

        if (targetElement) {
            const container = containerRef.current;
            const elementTop = targetElement.offsetTop;
            container.scrollTo({
                top: elementTop - container.offsetTop,
                behavior: "smooth",
            });
        }
    }, [currentTime]);

    const handleTimestampClick = (timestamp) => {
        const [hours, minutes, seconds] = timestamp.split(":");
        const totalSeconds =
            parseInt(hours) * 3600 +
            parseInt(minutes) * 60 +
            parseFloat(seconds);

        if (onSeek) {
            onSeek(totalSeconds);
        }
    };

    const lines = text.split("\n");
    const subtitles = [];
    let currentSubtitle = {};

    // Parse SRT content
    lines.forEach((line) => {
        const timestampMatch = line.match(
            /(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/,
        );
        if (timestampMatch) {
            if (currentSubtitle.timestamp) {
                subtitles.push(currentSubtitle);
            }
            // Convert comma to dot for consistency with VTT format
            currentSubtitle = {
                timestamp: timestampMatch[1].replace(",", "."),
                text: "",
            };
        } else if (
            line.trim() &&
            !line.match(/^\d+$/) &&
            currentSubtitle.timestamp
        ) {
            // Ignore subtitle numbers, only add text lines
            currentSubtitle.text = (currentSubtitle.text + " " + line).trim();
        }
    });
    if (currentSubtitle.timestamp) {
        subtitles.push(currentSubtitle);
    }

    return (
        <div
            ref={containerRef}
            className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 overflow-y-auto max-h-[500px] text-sm"
        >
            {subtitles.map((subtitle, index) => (
                <React.Fragment key={index}>
                    <div
                        className="subtitle-row"
                        data-timestamp={subtitle.timestamp}
                    >
                        <a
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                handleTimestampClick(subtitle.timestamp);
                            }}
                            className="text-blue-600 hover:text-blue-800"
                        >
                            {subtitle.timestamp}
                        </a>
                    </div>
                    <input
                        type="text"
                        value={subtitle.text}
                        onChange={(e) => {
                            const updatedSubtitles = [...subtitles];
                            updatedSubtitles[index].text = e.target.value;
                            onSubtitleChange(updatedSubtitles);
                        }}
                        className="border-0 bg-transparent p-0 focus:outline-0 focus:ring-0 text-sm"
                    />
                </React.Fragment>
            ))}
        </div>
    );
}

// New EditableName component
function EditableName({ name, onNameChange }) {
    const { t } = useTranslation();
    const [tempName, setTempName] = useState(name);
    const [editing, setEditing] = useState(false);

    useEffect(() => {
        setTempName(name);
    }, [name]);

    const handleSave = async () => {
        if (!tempName) return;
        setEditing(false);
        onNameChange(tempName);
    };

    const handleCancel = () => {
        setEditing(false);
        setTempName(name);
    };

    return (
        <div>
            {editing ? (
                <div className="flex gap-2">
                    <input
                        autoFocus
                        type="text"
                        className="border-0 bg-gray-50 p-0 focus:outline-0 focus:ring-0 font-medium"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleSave();
                            if (e.key === "Escape") handleCancel();
                        }}
                    />
                    <div className="flex gap-2">
                        <LoadingButton
                            text={t("Saving...")}
                            loading={false}
                            className="font-medium rounded-md w-16 py-0 bg-gray-50 text-xs hover:bg-gray-100 active:bg-gray-200"
                            onClick={handleSave}
                        >
                            {t("Save")}
                        </LoadingButton>
                        <button
                            className="font-medium rounded-md w-16 py-0 bg-gray-50 text-xs hover:bg-gray-100 active:bg-gray-200"
                            onClick={handleCancel}
                        >
                            {t("Cancel")}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex gap-2 items-center">
                    <h1
                        className=" font-medium hover:underline cursor-pointer"
                        onClick={() => setEditing(true)}
                    >
                        {name}
                    </h1>
                    <button
                        title={t("Edit")}
                        className="text-gray-200 hover:text-gray-600 text-sm"
                        onClick={() => setEditing(true)}
                    >
                        <FaEdit />
                    </button>
                </div>
            )}
        </div>
    );
}

// New DownloadButton component
function DownloadButton({ format, name, text }) {
    const { t } = useTranslation();

    const convertVttToSrt = (vttText) => {
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
                    srtContent += `${subtitleCount}\n${currentSubtitle.timestamp}\n${currentSubtitle.text}\n\n`;
                    subtitleCount++;
                }
                // Convert timestamp format from VTT to SRT (replace . with ,)
                currentSubtitle = {
                    timestamp: `${timestampMatch[1].replace(".", ",")} --> ${timestampMatch[2].replace(".", ",")}`,
                    text: "",
                };
            } else if (line.trim() && currentSubtitle.timestamp) {
                currentSubtitle.text = (
                    currentSubtitle.text +
                    " " +
                    line
                ).trim();
            }
        });

        // Add the last subtitle
        if (currentSubtitle.timestamp) {
            srtContent += `${subtitleCount}\n${currentSubtitle.timestamp}\n${currentSubtitle.text}\n\n`;
        }

        return srtContent.trim();
    };

    const downloadFile = (selectedFormat) => {
        let downloadText = text;

        // Convert format if needed
        if (format === "vtt" && selectedFormat === "srt") {
            downloadText = convertVttToSrt(text);
        }

        const element = document.createElement("a");
        const file = new Blob([downloadText], { type: "text/plain" });
        element.href = URL.createObjectURL(file);
        const fileExt = selectedFormat;
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
                        onClick={() => downloadFile("vtt")}
                    >
                        {t("Download VTT")}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            ) : (
                <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => downloadFile("txt")} className="text-xs">
                        {t("Download .txt")}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            )}
        </DropdownMenu>
    );
}

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

function TranscriptView({
    name,
    onNameChange,
    text,
    format,
    onSeek,
    currentTime,
    onDeleteTrack,
    onTextChange,
}) {
    const { t } = useTranslation();
    const [isEditing, setIsEditing] = useState(false);
    const [editableText, setEditableText] = useState(text);

    useEffect(() => {
        setEditableText(text);
    }, [text]);

    const handleSave = () => {
        onTextChange(editableText);
        setIsEditing(false);
    };

    return (
        <>
            <div className="transcription-taxonomy-container flex flex-col gap-2 overflow-y-auto mt-6">
                <div>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <EditableName name={name} onNameChange={onNameChange} />

                        <div className="flex items-center gap-2 justify-end">
                            {isEditing ? (
                                <>
                                    <button
                                        onClick={handleSave}
                                        className="lb-outline-secondary flex items-center gap-1 text-xs"
                                    >
                                        {t("Save")}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsEditing(false);
                                            setEditableText(text);
                                        }}
                                        className="lb-outline-secondary flex items-center gap-1 text-xs"
                                    >
                                        {t("Cancel")}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setIsEditing(!isEditing)}
                                        className="lb-outline-secondary flex items-center gap-1 text-xs"
                                        title={t("Edit")}
                                    >
                                        <FaEdit className="h-4 w-4" />
                                        {t("Edit")}
                                    </button>
                                    <TaxonomyDialog text={text} />
                                    <DownloadButton
                                        format={format}
                                        name={name}
                                        text={text}
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
                                                        onDeleteTrack(name);
                                                    }
                                                }}
                                            >
                                                {t("Delete track")}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <div className="transcription-section relative">
                    {isEditing ? (
                        <div className="border border-gray-300 rounded-md p-2.5 bg-gray-50">
                            <textarea
                                value={editableText}
                                onChange={(e) =>
                                    setEditableText(e.target.value)
                                }
                                className="w-full h-[400px] focus:outline-none border rounded-md bg-white"
                            />
                        </div>
                    ) : (
                        <div className="border border-gray-300 rounded-md p-2.5 bg-gray-50">
                            {format === "vtt" && text ? (
                                <VttSubtitles
                                    text={text}
                                    onSeek={onSeek}
                                    currentTime={currentTime}
                                />
                            ) : format === "srt" && text ? (
                                <SrtSubtitles
                                    text={text}
                                    onSeek={onSeek}
                                    currentTime={currentTime}
                                />
                            ) : text ? (
                                <pre className="whitespace-pre-wrap text-sm">
                                    {text.replace(/\n/g, "\n\n")}
                                </pre>
                            ) : (
                                "No content"
                            )}
                        </div>
                    )}
                    <div className="absolute top-3 end-3 flex gap-1 bg-gray-50 opacity-80  hover:opacity-100 text-sm">
                        {!isEditing && text && (
                            <CopyButton
                                item={text}
                                variant={"opaque"}
                                className=""
                            />
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

export default TranscriptView;
