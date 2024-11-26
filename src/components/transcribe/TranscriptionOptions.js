"use client";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    ClipboardIcon,
    LanguagesIcon,
    UploadIcon,
    VideoIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import AddTrackDialog from "./AddTrackDialog";

export function AddTrackButton({
    url,
    onAdd,
    async = true,
    apolloClient,
    trigger,
    transcripts = [],
    addTrackDialogOpen,
    setAddTrackDialogOpen,
    selectedTab,
    setSelectedTab,
    activeTranscript,
}) {
    const { t } = useTranslation();
    const options = [
        url ? "transcribe" : null,
        transcripts.length > 0 ? "translate" : null,
        "upload",
        "clipboard",
    ].filter(Boolean);

    return (
        <div className="">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
                <DropdownMenuContent>
                    {options.map((option) => {
                        switch (option) {
                            case "transcribe":
                                return (
                                    url && (
                                        <DropdownMenuItem
                                            key="transcribe"
                                            onClick={() => {
                                                setSelectedTab("transcribe");
                                                setTimeout(
                                                    () => setAddTrackDialogOpen(true),
                                                    1,
                                                );
                                            }}
                                        >
                                            <VideoIcon className="h-4 w-4 me-2" />
                                            {t("Transcribe")}
                                        </DropdownMenuItem>
                                    )
                                );
                            case "translate":
                                return (
                                    <DropdownMenuItem
                                        key="translate"
                                        onClick={() => {
                                            setSelectedTab("translate");
                                            setTimeout(
                                                () => setAddTrackDialogOpen(true),
                                                1,
                                            );
                                        }}
                                    >
                                        <LanguagesIcon className="h-4 w-4 me-2" />
                                        {t("Translate")}
                                    </DropdownMenuItem>
                                );
                            case "upload":
                                return (
                                    <DropdownMenuItem
                                        key="upload"
                                        onClick={() => {
                                            setSelectedTab("upload");
                                            setTimeout(
                                                () => setAddTrackDialogOpen(true),
                                                1,
                                            );
                                        }}
                                    >
                                        <UploadIcon className="h-4 w-4 me-2" />
                                        {t("Upload")}
                                    </DropdownMenuItem>
                                );
                            case "clipboard":
                                return (
                                    <DropdownMenuItem
                                        key="clipboard"
                                        onClick={() => {
                                            setSelectedTab("clipboard");
                                            setTimeout(
                                                () => setAddTrackDialogOpen(true),
                                                1,
                                            );
                                        }}
                                    >
                                        <ClipboardIcon className="h-4 w-4 me-2" />
                                        {t("Paste")}
                                    </DropdownMenuItem>
                                );
                            default:
                                return null;
                        }
                    })}
                </DropdownMenuContent>
            </DropdownMenu>
            <AddTrackDialog
                addTrackDialogOpen={addTrackDialogOpen}
                setAddTrackDialogOpen={setAddTrackDialogOpen}
                url={url}
                transcripts={transcripts}
                onAdd={onAdd}
                options={options}
                async={async}
                apolloClient={apolloClient}
                defaultTab={selectedTab}
                activeTranscript={activeTranscript}
            />
        </div>
    );
}
