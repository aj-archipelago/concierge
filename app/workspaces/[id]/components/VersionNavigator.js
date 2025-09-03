"use client";
import { cn } from "@/lib/utils";
import { LanguageContext } from "@/src/contexts/LanguageProvider";
import {
    ArrowLeftIcon,
    ArrowRightIcon,
    CopyIcon,
    TrashIcon,
} from "lucide-react";
import { useContext } from "react";
// Tooltip and Link2Icon no longer needed - functionality moved to PublishedAppletManageDialog
// ServerContext no longer needed in VersionNavigator - moved to PublishedAppletManageDialog
import { useState } from "react";
// useParams no longer needed in VersionNavigator - moved to PublishedAppletManageDialog
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
import { useTranslation } from "react-i18next";
import PublishConfirmDialog from "./PublishConfirmDialog";
import PublishedAppletManageDialog from "./PublishedAppletManageDialog";
// useWorkspaceApp no longer needed in VersionNavigator - moved to PublishedAppletManageDialog

// CopyPublishedLinkButton functionality is now integrated into PublishedAppletManageDialog

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
    const [showManageDialog, setShowManageDialog] = useState(false);
    const [deleteVersionDialogOpen, setDeleteVersionDialogOpen] =
        useState(false);

    // Handle unpublish and close dialog
    const handleUnpublishAndClose = () => {
        onUnpublish();
        setShowManageDialog(false);
    };

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

    const handlePublishConfirm = async (
        publishToAppStore,
        appName,
        selectedIcon,
        appSlug,
    ) => {
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

        try {
            await onPublishVersion(
                activeVersionIndex,
                publishToAppStore,
                appName,
                selectedIcon,
                appSlug,
            );
            // Only close dialog on success
            setShowPublishDialog(false);
        } catch (error) {
            // Don't close dialog on error - let PublishConfirmDialog handle it
            throw error;
        }
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
                    className="border rounded-md border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm enabled:hover:bg-gray-100 dark:enabled:hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600 dark:focus-visible:outline-gray-400 disabled:opacity-50 enabled:active:bg-gray-200 dark:enabled:active:bg-gray-600 bg-white dark:bg-gray-800"
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
                    className="border rounded-md border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm enabled:hover:bg-gray-100 dark:enabled:hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600 dark:focus-visible:outline-gray-400 disabled:opacity-50 enabled:active:bg-gray-200 dark:enabled:active:bg-gray-600 bg-white dark:bg-gray-800"
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
                <span className="text-sm text-gray-700 dark:text-gray-200 whitespace-nowrap">
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
                                <button
                                    className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-sm border border-emerald-600 hover:bg-emerald-600 transition cursor-pointer"
                                    style={{
                                        letterSpacing: "0.03em",
                                    }}
                                    onClick={() => setShowManageDialog(true)}
                                    type="button"
                                >
                                    {t("Published")}
                                </button>
                                {isOwner && (
                                    <button
                                        className="px-3 py-1 rounded-full text-xs font-bold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition shadow-sm"
                                        onClick={handleDuplicateVersion}
                                        title={t("Duplicate this version")}
                                    >
                                        <CopyIcon className="w-4 h-4" />
                                    </button>
                                )}
                            </>
                        ) : (
                            <button
                                className="px-3 py-1 rounded-full text-xs font-bold border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition shadow-sm whitespace-nowrap"
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
                                    className="px-3 py-1 rounded-full text-xs font-bold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition shadow-sm"
                                    onClick={handleDuplicateVersion}
                                    title={t("Duplicate this version")}
                                >
                                    <CopyIcon className="w-4 h-4" />
                                </button>
                                <button
                                    className="px-3 py-1 rounded-full text-xs font-bold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition shadow-sm"
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

            <PublishedAppletManageDialog
                isOpen={showManageDialog}
                onClose={() => setShowManageDialog(false)}
                onUnpublish={handleUnpublishAndClose}
                workspaceId={workspaceId}
                isPending={updateApplet.isPending}
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
