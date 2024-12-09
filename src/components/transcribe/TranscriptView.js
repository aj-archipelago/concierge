"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import CopyButton from "../CopyButton";

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
                        <button
                            onClick={() =>
                                handleTimestampClick(subtitle.timestamp)
                            }
                            className="text-blue-600 hover:text-blue-800"
                        >
                            {subtitle.timestamp}
                        </button>
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
                        <button
                            onClick={() =>
                                handleTimestampClick(subtitle.timestamp)
                            }
                            className="text-blue-600 hover:text-blue-800"
                        >
                            {subtitle.timestamp}
                        </button>
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
