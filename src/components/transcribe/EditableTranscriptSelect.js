"use client";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import dayjs from "dayjs";
import { PlusCircleIcon, TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaEdit } from "react-icons/fa";
import ReactTimeAgo from "react-time-ago";
import LoadingButton from "../editor/LoadingButton";
import DownloadSubtitlesButton from "./DownloadSubtitlesButton";
import TaxonomyDialog from "./TaxonomyDialog";
import { AddTrackButton } from "./TranscriptionOptions";

export default function EditableTranscriptSelect({
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
                            <DownloadSubtitlesButton
                                format={transcripts[activeTranscript].format}
                                name={transcripts[activeTranscript].name}
                                text={transcripts[activeTranscript].text}
                            />
                            <button
                                className="text-gray-600 hover:text-red-700"
                                onClick={() => {
                                    if (
                                        window.confirm(
                                            t(
                                                `Are you sure you want to delete ${transcripts[activeTranscript].name}?`,
                                            ),
                                        )
                                    ) {
                                        onDeleteTrack();
                                    }
                                }}
                            >
                                <TrashIcon className="h-4 w-4" />
                            </button>
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
