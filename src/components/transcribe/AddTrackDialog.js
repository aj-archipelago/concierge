"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { AddTrackOptions } from "./AddTrackOptions";

export default function AddTrackDialog({
    dialogOpen,
    setDialogOpen,
    url,
    transcripts,
    onAdd,
    options,
    async = true,
    apolloClient,
    defaultTab,
    activeTranscript,
}) {
    return (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="min-h-[450px]">
                <DialogHeader>
                    <DialogTitle>Add subtitles/transcripts</DialogTitle>
                    <DialogDescription>
                        Please select the options below to create subtitles for
                        your video.
                    </DialogDescription>
                    <AddTrackOptions
                        url={url}
                        transcripts={transcripts}
                        onAdd={(x) => {
                            onAdd(x);
                            setDialogOpen(false);
                        }}
                        options={options}
                        async={async}
                        apolloClient={apolloClient}
                        defaultTab={defaultTab}
                        activeTranscript={activeTranscript}
                        onClose={() => setDialogOpen(false)}
                    />
                </DialogHeader>
            </DialogContent>
        </Dialog>
    );
}
