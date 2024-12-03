"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { AddTrackOptions } from "./AddTrackOptions";
import { useTranslation } from "react-i18next";

export default function AddTrackDialog({
    addTrackDialogOpen,
    setAddTrackDialogOpen,
    url,
    transcripts,
    onAdd,
    options,
    async = true,
    apolloClient,
    defaultTab,
    activeTranscript,
}) {
    const { t } = useTranslation();

    return (
        <Dialog open={addTrackDialogOpen} onOpenChange={setAddTrackDialogOpen}>
            <DialogContent className="min-h-[450px]">
                <DialogHeader>
                    <DialogTitle>{t("Add subtitles/transcripts")}</DialogTitle>
                    <DialogDescription>
                        {t(
                            "Please select the options below to create subtitles for your video.",
                        )}
                    </DialogDescription>
                    <AddTrackOptions
                        url={url}
                        transcripts={transcripts}
                        onAdd={(x) => {
                            onAdd(x);
                            setAddTrackDialogOpen(false);
                        }}
                        options={options}
                        async={async}
                        apolloClient={apolloClient}
                        defaultTab={defaultTab}
                        activeTranscript={activeTranscript}
                        onClose={() => setAddTrackDialogOpen(false)}
                    />
                </DialogHeader>
            </DialogContent>
        </Dialog>
    );
}
