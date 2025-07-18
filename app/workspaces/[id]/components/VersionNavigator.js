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
import { useTranslation } from "react-i18next";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PublishConfirmDialog from "./PublishConfirmDialog";

function CopyPublishedLinkButton() {
    const { t } = useTranslation();
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
                        aria-label={t("Copy or open published link")}
                        tabIndex={0}
                    >
                        <span
                            className={`p-1 rounded-full transition cursor-pointer ${copied ? "bg-emerald-100" : "hover:bg-emerald-100"}`}
                            onClick={handleCopy}
                            title={t("Copy link")}
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
                            title={t("Open link")}
                        >
                            {copied ? t("Copied!") : t("Open")}
                        </span>
                    </button>
                </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={10}>
                {copied ? t("Copied!") : placeholderLink}
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
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const [showPublishDialog, setShowPublishDialog] = useState(false);
    const [deleteVersionDialogOpen, setDeleteVersionDialogOpen] =
        useState(false);

    // Note: Version validation is handled in WorkspaceApplet.js to avoid duplicate validation
    const handleDuplicateVersion = () => {
        if (!isOwner) return;
        setHtmlVersions((prev) => {
            const newVersions = [...prev];
            const currentVersion = newVersions[activeVersionIndex];
            newVersions.splice(activeVersionIndex + 1, 0, currentVersion);

            // Adjust publishedVersionIndex if the published version comes after the duplicated version
            let newPublishedVersionIndex = publishedVersionIndex;
            if (
                publishedVersionIndex !== null &&
                publishedVersionIndex > activeVersionIndex
            ) {
                newPublishedVersionIndex = publishedVersionIndex + 1;
            }

            updateApplet.mutate({
                id: workspaceId,
                data: {
                    htmlVersions: newVersions,
                    publishedVersionIndex: newPublishedVersionIndex,
                },
            });

            setPublishedVersionIndex(newPublishedVersionIndex);
            setActiveVersionIndex(activeVersionIndex + 1);
            return newVersions;
        });
    };

    const handleDeleteVersion = () => {
        if (!isOwner) return;
        setDeleteVersionDialogOpen(true);
    };

    const confirmDeleteVersion = () => {
        setDeleteVersionDialogOpen(false);
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
    };

    const handlePublishClick = () => {
        setShowPublishDialog(true);
    };

    const handlePublishConfirm = (publishToAppStore, appName, selectedIcon) => {
        // Validate that we're publishing a valid version
        if (
            activeVersionIndex < 0 ||
            activeVersionIndex >= htmlVersions.length
        ) {
            console.error(
                `Cannot publish invalid version index: ${activeVersionIndex}, available: 0-${htmlVersions.length - 1}`,
            );
            return;
        }

        console.log(
            `VersionNavigator: Publishing version ${activeVersionIndex + 1} (index ${activeVersionIndex})`,
        );

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
            <div
                className={cn(
                    "flex items-center gap-2",
                    direction === "rtl" ? "flex-row-reverse" : "flex-row",
                )}
            >
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
                    {t("Version")}{" "}
                    {Math.max(
                        1,
                        Math.min(activeVersionIndex + 1, htmlVersions.length),
                    )}{" "}
                    {t("of")} {Math.max(1, htmlVersions.length)}
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
                                    {t("Published")}
                                </span>
                                <CopyPublishedLinkButton />
                                {isOwner && (
                                    <>
                                        <button
                                            className=" px-3 py-1 rounded-full text-xs font-bold border border-red-300 text-red-600 bg-white hover:bg-red-50 hover:border-red-400 transition focus:ring-2 focus:ring-red-200 focus:outline-none shadow-sm"
                                            onClick={onUnpublish}
                                            disabled={updateApplet.isPending}
                                            type="button"
                                        >
                                            {t("Unpublish")}
                                        </button>
                                        <button
                                            className="px-3 py-1 rounded-full text-xs font-bold border lb-outline-secondary bg-white"
                                            onClick={handleDuplicateVersion}
                                            title={t("Duplicate this version")}
                                        >
                                            <CopyIcon className="w-4 h-4" />
                                        </button>
                                    </>
                                )}
                            </>
                        ) : (
                            <button
                                className="px-3 py-1 rounded-full text-xs font-bold border border-gray-300 bg-gray-100 text-gray-600 hover:bg-gray-200 transition shadow-sm whitespace-nowrap"
                                onClick={() =>
                                    setActiveVersionIndex(publishedVersionIndex)
                                }
                                title={t(
                                    "Go to published version (v{{version}})",
                                    { version: publishedVersionIndex + 1 },
                                )}
                                type="button"
                            >
                                {t("Published: v{{version}}", {
                                    version: publishedVersionIndex + 1,
                                })}
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
                                        ? t("Publish")
                                        : t("Publish this version")}
                                </button>
                                <button
                                    className="px-3 py-1 rounded-full text-xs font-bold border lb-outline-secondary bg-white"
                                    onClick={handleDuplicateVersion}
                                    title={t("Duplicate this version")}
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
                workspaceId={workspaceId}
            />

            <AlertDialog
                open={deleteVersionDialogOpen}
                onOpenChange={setDeleteVersionDialogOpen}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("Delete Version")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("Are you sure you want to delete this version?")}
                            <br />
                            <span className="text-red-600 font-medium">
                                {t("This action cannot be undone.")}
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            autoFocus
                            onClick={confirmDeleteVersion}
                            disabled={updateApplet.isPending}
                        >
                            {updateApplet.isPending
                                ? t("Deleting...")
                                : t("Delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
