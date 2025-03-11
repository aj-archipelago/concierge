"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaEdit } from "react-icons/fa";
import TextareaAutosize from "react-textarea-autosize";
import CopyButton from "../CopyButton";
import { parse, formatTimestamp } from "@aj-archipelago/subvibe";
import { RefreshCw } from "lucide-react";
import { isYoutubeUrl } from "../../utils/urlUtils";

// Simplified VTT component
function VttSubtitles({ name, text, onSeek, currentTime, onTextChange }) {
    const containerRef = useRef(null);
    const parsed = parse(text);

    const subtitles = parsed.cues;
    subtitles.forEach((subtitle) => {
        // Replace the integer startTime/endTime with formatted strings for UI display
        subtitle.timestamp = formatTimestamp(subtitle.startTime);
        subtitle.endTimestamp = formatTimestamp(subtitle.endTime);
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
            className="grid sm:grid-cols-[auto,1fr] gap-x-4 gap-y-2 overflow-y-auto max-h-[500px] text-sm"
        >
            {subtitles.map((subtitle, index) => (
                <React.Fragment key={`${name}-${index}`}>
                    <div
                        className="subtitle-row"
                        data-timestamp={subtitle.timestamp}
                    >
                        <button
                            onClick={() =>
                                handleTimestampClick(subtitle.timestamp)
                            }
                            className="text-sky-600 hover:text-sky-800"
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
                                updatedSubtitles
                                    .map(
                                        (subtitle, i) =>
                                            `${i + 1}\n${subtitle.timestamp} --> ${subtitle.endTimestamp}\n${subtitle.text}`,
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

// Add this new component to handle individual subtitle text
function EditableSubtitleText({ text, onSave, className = "" }) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedText, setEditedText] = useState(text);
    const inputRef = useRef(null);

    useEffect(() => {
        setEditedText(text);
    }, [text]);

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
                <TextareaAutosize
                    ref={inputRef}
                    type="text"
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    onBlur={() => {
                        setIsEditing(false);
                        onSave(editedText);
                    }}
                    onKeyDown={handleKeyDown}
                    className="bg-yellow-50 flex-1 border-0 bg-transparent p-0 focus:outline-0 focus:ring-0 text-sm max-w-[calc(100%-20px)] resize-none"
                />
            </div>
        );
    }

    return (
        <div
            onClick={() => setIsEditing(true)}
            className={`group cursor-pointer flex items-center gap-2 ${className}`}
        >
            <div className="hover:underline w-[calc(100%-20px)]">{text}</div>
            <FaEdit className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-sky-600" />
        </div>
    );
}

function TranscriptView({
    name,
    text,
    format,
    onSeek,
    currentTime,
    onTextChange,
    isEditing,
    setIsEditing,
    onRetranscribe,
    isRetranscribing,
    showRetranscribeButton = true,
    url,
}) {
    const { t } = useTranslation();
    const [editableText, setEditableText] = useState(text);

    // Determine if we should show the retranscribe button
    const shouldShowRetranscribeButton =
        showRetranscribeButton && !isYoutubeUrl(url);

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
        <div className="transcription-taxonomy-container flex flex-col gap-2 overflow-y-auto mt-2">
            <div className="transcription-section relative">
                {isEditing ? (
                    <div className="border border-gray-300 rounded-md p-2.5 bg-gray-50 mb-4">
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
                    <div className="border border-gray-300 rounded-md py-2.5 px-2.5 bg-gray-50 mb-4">
                        {format === "vtt" && text ? (
                            <VttSubtitles
                                name={name}
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

                {/* Show retranscribe button only if shouldShowRetranscribeButton is true and not currently retranscribing */}
                {!isRetranscribing && shouldShowRetranscribeButton && (
                    <div className="-mt-2 mb-4 text-xs flex flex-col sm:flex-row gap-1 sm:gap-2">
                        <div className="text-gray-500">
                            {t("Transcript not looking right?")}
                        </div>
                        <button onClick={onRetranscribe} className="">
                            <span className="flex gap-1">
                                <RefreshCw className="h-3 w-3 text-gray-500" />
                                <span className="text-sky-600 text-start">
                                    {t(
                                        "Transcribe again using an alternate model",
                                    )}
                                </span>
                            </span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default TranscriptView;
