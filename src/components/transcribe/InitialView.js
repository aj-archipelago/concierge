"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    TextIcon,
    VideoIcon
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import AddTrackDialog from "./AddTrackDialog";
import VideoInput from "./VideoInput";

export default function InitialView({ setAddTrackDialogOpen, setSelectedTab, addTrackDialogOpen, url, transcripts, addSubtitleTrack, apolloClient, activeTranscript, setVideoInformation, updateUserState, setUrl }) {
    const { t } = useTranslation();
    const [showVideoInput, setShowVideoInput] = useState(false);
    
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
                        setAddTrackDialogOpen(true);
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
                addTrackDialogOpen={addTrackDialogOpen}
                setAddTrackDialogOpen={setAddTrackDialogOpen}
                url={url}
                transcripts={transcripts}
                onAdd={addSubtitleTrack}
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
                        setVideoInformation={(videoInfo) => {
                            setVideoInformation(videoInfo);
                            updateUserState({
                                videoInformation: videoInfo,
                                url: videoInfo?.videoUrl || ""
                            });
                            setShowVideoInput(false);
                        }}
                        onCancel={() => setShowVideoInput(false)}
                    />
                </DialogContent>
            </Dialog>
        </>
    );
}