"use client";
import { cn } from "@/lib/utils";
import { LanguageContext } from "@/src/contexts/LanguageProvider";
import {
    ArrowLeftIcon,
    ArrowRightIcon,
    TrashIcon,
    CheckIcon,
    CopyIcon,
} from "lucide-react";
import { useContext } from "react";
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
} from "@/components/ui/tooltip";
import { Link2Icon } from "lucide-react";
import { ServerContext } from "../../../../src/App";
import { useState } from "react";
import { useParams } from "next/navigation";
import PublishConfirmDialog from "./PublishConfirmDialog";

function CopyPublishedLinkButton() {
    const [copied, setCopied] = useState(false);
    const serverContext = useContext(ServerContext);
    const { id } = useParams();
    const placeholderLink = `${serverContext.serverUrl}/published/workspaces/${id}/applet`;

    const handleCopy = async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(placeholderLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    };

    const handleOpen = (e) => {
        e.stopPropagation();
        window.open(placeholderLink, "_blank", "noopener,noreferrer");
    };

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="inline-flex">
                    <button
                        className={`flex items-center px-2 py-0.5 rounded-full border border-emerald-200 bg-white hover:bg-emerald-50 transition shadow-sm ${copied ? "border-emerald-400 bg-emerald-50" : ""}`}
                        type="button"
                        aria-label="Copy or open published link"
                        tabIndex={0}
                    >
                        <span
                            className={`p-1 rounded-full transition cursor-pointer ${copied ? "bg-emerald-100" : "hover:bg-emerald-100"}`}
                            onClick={handleCopy}
                            title="Copy link"
                        >
                            {copied ? (
                                <CheckIcon className="w-4 h-4 text-emerald-700" />
                            ) : (
                                <Link2Icon className="w-4 h-4 text-emerald-700" />
                            )}
                        </span>
                        <span
                            className="px-1 py-1 rounded-full text-xs font-bold text-emerald-700 underline hover:text-emerald-900 transition cursor-pointer"
                            onClick={handleOpen}
                            title="Open link"
                        >
                            {copied ? "Copied!" : "Open"}
                        </span>
                    </button>
                </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={10}>
                {copied ? "Copied!" : placeholderLink}
            </TooltipContent>
        </Tooltip>
    );
}

export default function VersionNavigator({
    activeVersionIndex,
    setActiveVersionIndex,
    setPublishedVersionIndex,
    htmlVersions,
    setHtmlVersions,
    publishedVersionIndex,
    onPublishVersion,
    onUnpublish,
    updateApplet,
    workspaceId,
    isOwner = true,
}) {
    const { direction } = useContext(LanguageContext);
    const [showPublishDialog, setShowPublishDialog] = useState(false);

    // Note: Version validation is handled in WorkspaceApplet.js to avoid duplicate validation

    const handleDuplicateVersion = () => {
        if (!isOwner) return;
        setHtmlVersions((prev) => {
            const newVersions = [...prev];
            const currentVersion = newVersions[activeVersionIndex];
            newVersions.splice(activeVersionIndex + 1, 0, currentVersion);

            updateApplet.mutate({
                id: workspaceId,
                data: {
                    htmlVersions: newVersions,
                    publishedVersionIndex,
                },
            });

            setActiveVersionIndex(activeVersionIndex + 1);
            return newVersions;
        });
    };

    const handleDeleteVersion = () => {
        if (!isOwner) return;
        if (window.confirm("Are you sure you want to delete this version?")) {
            setHtmlVersions((prev) => {
                const newVersions = prev.filter(
                    (_, index) => index !== activeVersionIndex,
                );

                let newPublishedVersionIndex = publishedVersionIndex;

                if (activeVersionIndex === publishedVersionIndex) {
                    newPublishedVersionIndex = null;
                }

                if (activeVersionIndex < publishedVersionIndex) {
                    newPublishedVersionIndex = publishedVersionIndex - 1;
                }

                if (
                    newPublishedVersionIndex !== null &&
                    newPublishedVersionIndex >= newVersions.length
                ) {
                    newPublishedVersionIndex = newVersions.length - 1;
                }

                updateApplet.mutate({
                    id: workspaceId,
                    data: {
                        htmlVersions: newVersions,
                        publishedVersionIndex: newPublishedVersionIndex,
                    },
                });
                setPublishedVersionIndex(newPublishedVersionIndex);
                setActiveVersionIndex(Math.max(0, activeVersionIndex - 1));
                return newVersions;
            });
        }
    };

    const handlePublishClick = () => {
        setShowPublishDialog(true);
    };

    const handlePublishConfirm = (publishToAppStore, appName, selectedIcon) => {
        onPublishVersion(
            activeVersionIndex,
            publishToAppStore,
            appName,
            selectedIcon,
        );
        setShowPublishDialog(false);
    };

    const handlePublishCancel = () => {
        setShowPublishDialog(false);
    };

    return (
        <div className="flex flex-col lg:flex-row justify-between items-center mb-2">
            <div className="flex items-center gap-2">
                <button
                    className={cn("lb-outline-secondary", "bg-white")}
                    onClick={() =>
                        setActiveVersionIndex((prev) => Math.max(0, prev - 1))
                    }
                    disabled={activeVersionIndex <= 0}
                >
                    {direction === "rtl" ? (
                        <ArrowRightIcon className="w-4 h-4" />
                    ) : (
                        <ArrowLeftIcon className="w-4 h-4" />
                    )}
                </button>
                <button
                    className={cn("lb-outline-secondary ", "bg-white")}
                    onClick={() =>
                        setActiveVersionIndex((prev) =>
                            Math.min(htmlVersions.length - 1, prev + 1),
                        )
                    }
                    disabled={activeVersionIndex >= htmlVersions.length - 1}
                >
                    {direction === "rtl" ? (
                        <ArrowLeftIcon className="w-4 h-4" />
                    ) : (
                        <ArrowRightIcon className="w-4 h-4" />
                    )}
                </button>
                <span className="text-sm text-gray-600 whitespace-nowrap">
                    Version{" "}
                    {Math.max(
                        1,
                        Math.min(activeVersionIndex + 1, htmlVersions.length),
                    )}{" "}
                    of {Math.max(1, htmlVersions.length)}
                </span>
                <div className="flex items-center gap-2">
                    {publishedVersionIndex !== null &&
                        (activeVersionIndex === publishedVersionIndex ? (
                            <>
                                <span
                                    className=" px-3 py-1 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-sm border border-emerald-600"
                                    style={{
                                        letterSpacing: "0.03em",
                                    }}
                                >
                                    Published
                                </span>
                                <CopyPublishedLinkButton />
                                {isOwner && (
                                    <button
                                        className=" px-3 py-1 rounded-full text-xs font-bold border border-red-300 text-red-600 bg-white hover:bg-red-50 hover:border-red-400 transition focus:ring-2 focus:ring-red-200 focus:outline-none shadow-sm"
                                        onClick={onUnpublish}
                                        disabled={updateApplet.isPending}
                                        type="button"
                                    >
                                        Unpublish
                                    </button>
                                )}
                            </>
                        ) : (
                            <button
                                className="px-3 py-1 rounded-full text-xs font-bold border border-gray-300 bg-gray-100 text-gray-600 hover:bg-gray-200 transition shadow-sm whitespace-nowrap"
                                onClick={() =>
                                    setActiveVersionIndex(publishedVersionIndex)
                                }
                                title={`Go to published version (v${publishedVersionIndex + 1})`}
                                type="button"
                            >
                                Published: v{publishedVersionIndex + 1}
                            </button>
                        ))}
                    {activeVersionIndex !== publishedVersionIndex &&
                        isOwner && (
                            <>
                                <button
                                    className="px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md hover:from-emerald-600 hover:to-emerald-700 transition focus:ring-2 focus:ring-emerald-200 focus:outline-none whitespace-nowrap"
                                    onClick={handlePublishClick}
                                    disabled={updateApplet.isPending}
                                    type="button"
                                >
                                    {publishedVersionIndex === null
                                        ? "Publish"
                                        : "Publish this version"}
                                </button>
                                <button
                                    className="px-3 py-1 rounded-full text-xs font-bold border lb-outline-secondary bg-white"
                                    onClick={handleDuplicateVersion}
                                    title="Duplicate this version"
                                >
                                    <CopyIcon className="w-4 h-4" />
                                </button>
                                <button
                                    className="px-3 py-1 rounded-full text-xs font-bold border lb-outline-secondary bg-white"
                                    onClick={handleDeleteVersion}
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </>
                        )}
                </div>
            </div>
            <PublishConfirmDialog
                isOpen={showPublishDialog}
                onClose={handlePublishCancel}
                onConfirm={handlePublishConfirm}
                isPending={updateApplet.isPending}
                versionNumber={activeVersionIndex + 1}
            />
        </div>
    );
}
