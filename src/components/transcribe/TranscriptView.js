"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import CopyButton from "../CopyButton";
import { FaCheck, FaCross, FaEdit } from "react-icons/fa";
import { XMarkIcon, CheckIcon } from "@heroicons/react/24/outline";
import { FaX } from "react-icons/fa6";

// Simplified VTT component
function VttSubtitles({ text, onSeek, currentTime, onTextChange }) {
    const containerRef = useRef(null);
    const lines = text.split("\n");
    const subtitles = [];
    let currentSubtitle = {};

    let isInSubtitle = false;
    let isHeader = true;
    lines.forEach((line) => {
        line = line.trim();

        // Handle header
        if (isHeader) {
            if (line === "WEBVTT") {
                return;
            }
            if (!line) {
                isHeader = false;
                return;
            }
            return;
        }

        // Skip empty lines and numeric identifiers
        if (!line || /^\d+$/.test(line)) {
            return;
        }

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
            isInSubtitle = true;
        } else if (isInSubtitle && currentSubtitle.timestamp) {
            currentSubtitle.text = (currentSubtitle.text + " " + line).trim();
        }
    });

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
                        <button
                            onClick={() =>
                                handleTimestampClick(subtitle.timestamp)
                            }
                            className="text-blue-600 hover:text-blue-800"
                        >
                            {subtitle.timestamp}
                        </button>
                    </div>
                    <EditableSubtitleText
                        text={subtitle.text}
                        onSave={(newText) => {
                            const updatedSubtitles = [...subtitles];
                            updatedSubtitles[index].text = newText;

                            // Reconstruct VTT text with header and subtitle numbers
                            const vttText =
                                "WEBVTT\n\n" +
                                subtitles
                                    .map(
                                        (subtitle, i) =>
                                            `${i + 1}\n${subtitle.timestamp} --> ${subtitle.timestamp}\n${subtitle.text}`,
                                    )
                                    .join("\n\n");
                            onTextChange(vttText);
                        }}
                        className="text-sm"
                    />
                </React.Fragment>
            ))}
        </div>
    );
}

// New SRT component
function SrtSubtitles({ text, onSeek, currentTime, onTextChange }) {
    const containerRef = useRef(null);

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

    let isInSubtitle = false;
    lines.forEach((line) => {
        line = line.trim();

        // Skip empty lines and numeric identifiers
        if (!line || /^\d+$/.test(line)) {
            return;
        }

        const timestampMatch = line.match(
            /(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/,
        );
        if (timestampMatch) {
            if (currentSubtitle.timestamp) {
                subtitles.push(currentSubtitle);
            }
            currentSubtitle = {
                timestamp: timestampMatch[1],
                endTimestamp: timestampMatch[2],
                text: "",
            };
            isInSubtitle = true;
        } else if (isInSubtitle && currentSubtitle.timestamp) {
            currentSubtitle.text = (currentSubtitle.text + " " + line).trim();
        }
    });

    // Don't forget to push the last subtitle
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
                        <button
                            onClick={() =>
                                handleTimestampClick(subtitle.timestamp)
                            }
                            className="text-blue-600 hover:text-blue-800"
                        >
                            {subtitle.timestamp}
                        </button>
                    </div>
                    <EditableSubtitleText
                        text={subtitle.text}
                        onSave={(newText) => {
                            const updatedSubtitles = [...subtitles];
                            updatedSubtitles[index].text = newText;

                            // Reconstruct SRT format with numbers, but don't display them
                            const srtText =
                                updatedSubtitles
                                    .map(
                                        (subtitle, i) =>
                                            `${i + 1}\n${subtitle.timestamp} --> ${subtitle.endTimestamp}\n${subtitle.text}`,
                                    )
                                    .join("\n\n") + "\n"; // Add final newline
                            onTextChange(srtText);
                        }}
                        className="text-sm"
                    />
                </React.Fragment>
            ))}
        </div>
    );
}

// Add this new component to handle individual subtitle text
function EditableSubtitleText({ text, onSave, className = "" }) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedText, setEditedText] = useState(text);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    const handleKeyDown = (e) => {
        if (e.key === "Enter") {
            onSave(editedText);
            setIsEditing(false);
        } else if (e.key === "Escape") {
            setEditedText(text);
            setIsEditing(false);
        }
    };

    if (isEditing) {
        return (
            <div className="flex items-center gap-2 w-full">
                <input
                    ref={inputRef}
                    type="text"
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="border-0 bg-transparent p-0 focus:outline-0 focus:ring-0 text-sm"
                />
                <div className="flex gap-1">
                    <button
                        onClick={() => {
                            onSave(editedText);
                            setIsEditing(false);
                        }}
                        className="p-1 hover:text-green-600 transition-colors"
                    >
                        <FaCheck className="w-3 h-3" />
                    </button>
                    <button
                        onClick={() => {
                            setEditedText(text);
                            setIsEditing(false);
                        }}
                        className="p-1 hover:text-red-600 transition-colors"
                    >
                        <FaX className="w-3 h-3" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            onClick={() => setIsEditing(true)}
            className={`group cursor-pointer flex items-center gap-2 ${className}`}
        >
            <span className="hover:underline">{text}</span>
            <FaEdit className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-sky-600" />
        </div>
    );
}

function TranscriptView({
    text,
    format,
    onSeek,
    currentTime,
    onTextChange,
    isEditing,
    setIsEditing,
}) {
    const { t } = useTranslation();
    const [editableText, setEditableText] = useState(text);

    useEffect(() => {
        setEditableText(text);
    }, [text]);

    const handleSave = () => {
        onTextChange(editableText);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditableText(text);
        setIsEditing(false);
    };

    return (
        <div className="transcription-taxonomy-container flex flex-col gap-2 overflow-y-auto mt-6">
            <div className="transcription-section relative">
                {isEditing ? (
                    <div className="border border-gray-300 rounded-md p-2.5 bg-gray-50">
                        <textarea
                            value={editableText}
                            onChange={(e) => setEditableText(e.target.value)}
                            className="w-full h-[400px] focus:outline-none border rounded-md bg-white"
                        />
                        <div className="flex justify-end gap-2 mt-2">
                            <button
                                onClick={handleSave}
                                className="lb-primary px-4"
                            >
                                {t("Save")}
                            </button>
                            <button
                                onClick={handleCancel}
                                className="lb-outline-secondary"
                            >
                                {t("Cancel")}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="border border-gray-300 rounded-md p-2.5 bg-gray-50">
                        {format === "vtt" && text ? (
                            <VttSubtitles
                                text={text}
                                onSeek={onSeek}
                                currentTime={currentTime}
                                onTextChange={onTextChange}
                            />
                        ) : format === "srt" && text ? (
                            <SrtSubtitles
                                text={text}
                                onSeek={onSeek}
                                currentTime={currentTime}
                                onTextChange={onTextChange}
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
                <div className="absolute top-3 end-3 flex gap-1 bg-gray-50 opacity-80 hover:opacity-100 text-sm">
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
    );
}

export default TranscriptView;
