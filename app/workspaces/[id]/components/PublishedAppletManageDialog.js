"use client";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ExternalLink, Copy, Check, Trash2 } from "lucide-react";
import { useState, useEffect, useContext } from "react";
import { useTranslation } from "react-i18next";
import { ServerContext } from "../../../../src/App";
import {
    useWorkspaceApp,
    useUpdateWorkspaceApplet,
    useWorkspaceApplet,
} from "../../../queries/workspaces";

export default function PublishedAppletManageDialog({
    isOpen,
    onClose,
    onUnpublish,
    workspaceId,
    isPending = false,
}) {
    const { t } = useTranslation();
    const serverContext = useContext(ServerContext);
    const [appName, setAppName] = useState("");
    const [appSlug, setAppSlug] = useState("");
    const [appDescription, setAppDescription] = useState("");
    const [copied, setCopied] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");

    // Fetch current app data and applet data
    const { data: app, refetch: refetchApp } = useWorkspaceApp(workspaceId);
    const { data: applet, refetch: refetchApplet } =
        useWorkspaceApplet(workspaceId);
    const updateApplet = useUpdateWorkspaceApplet();

    // Check if app is published to app store (has slug and is active)
    const isAppStorePublished = app?.slug && app?.status === "active";

    // Generate the published link
    const publishedLink = isAppStorePublished
        ? `${serverContext.serverUrl}/apps/${app.slug}`
        : `${serverContext.serverUrl}/published/workspaces/${workspaceId}/applet`;

    // Prefill form when dialog opens and refetch data to ensure it's up to date
    useEffect(() => {
        if (isOpen) {
            // Refetch app and applet data when dialog opens to ensure we have latest info
            refetchApp();
            refetchApplet();
            if (app) {
                setAppName(app.name || "");
                setAppSlug(app.slug || "");
                setAppDescription(app.description || "");
            }
        }
    }, [isOpen, app, refetchApp, refetchApplet]);

    // Reset form when dialog closes
    useEffect(() => {
        if (!isOpen) {
            setAppName("");
            setAppSlug("");
            setAppDescription("");
            setCopied(false);
            setIsSaving(false);
            setError("");
        }
    }, [isOpen]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(publishedLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error("Failed to copy link:", error);
        }
    };

    const handleOpen = () => {
        window.open(publishedLink, "_blank", "noopener,noreferrer");
    };

    const handleSave = async () => {
        if (
            !app ||
            !appName.trim() ||
            !appSlug.trim() ||
            !appDescription.trim()
        )
            return;

        setIsSaving(true);
        setError(""); // Clear previous errors

        try {
            // Update the app via the workspace applet endpoint
            await updateApplet.mutateAsync({
                id: workspaceId,
                data: {
                    publishToAppStore: true,
                    publishedVersionIndex: applet?.publishedVersionIndex,
                    appName: appName.trim(),
                    appSlug: appSlug.trim(),
                    appDescription: appDescription.trim(),
                },
            });

            // Refetch the app data to get updated values
            await refetchApp();
        } catch (error) {
            console.error("Failed to update app:", error);
            const errorMessage =
                error?.response?.data?.error ||
                error.message ||
                "Failed to update app";
            setError(errorMessage);
        } finally {
            setIsSaving(false);
        }
    };

    const isFormValid =
        appName.trim().length > 0 &&
        appSlug.trim().length > 0 &&
        appDescription.trim().length > 0;
    const hasChanges =
        isAppStorePublished &&
        app &&
        (appName !== app.name ||
            appSlug !== app.slug ||
            appDescription !== (app.description || ""));

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {t("Manage Published App")}
                    </DialogTitle>
                    <DialogDescription>
                        {isAppStorePublished
                            ? t(
                                  "Edit your app details or manage publication settings.",
                              )
                            : t(
                                  "Your applet has been published! Share the link below or manage publication settings.",
                              )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* App Name - Only show for app store publishing */}
                    {isAppStorePublished && (
                        <>
                            <div className="space-y-2">
                                <Label
                                    htmlFor="app-name"
                                    className="text-sm font-medium"
                                >
                                    {t("App Name")}
                                </Label>
                                <Input
                                    id="app-name"
                                    value={appName}
                                    onChange={(e) => setAppName(e.target.value)}
                                    placeholder={t("Enter app name")}
                                />
                            </div>

                            {/* App Slug */}
                            <div className="space-y-2">
                                <Label
                                    htmlFor="app-slug"
                                    className="text-sm font-medium"
                                >
                                    {t("App Slug")}
                                </Label>
                                <Input
                                    id="app-slug"
                                    value={appSlug}
                                    onChange={(e) => setAppSlug(e.target.value)}
                                    placeholder={t("Enter app slug")}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {t(
                                        "Your app will be accessible at: /apps/{{slug}}",
                                        { slug: appSlug || "your-slug" },
                                    )}
                                </p>
                            </div>

                            {/* App Description */}
                            <div className="space-y-2">
                                <Label
                                    htmlFor="app-description"
                                    className="text-sm font-medium"
                                >
                                    {t("App Description")}
                                </Label>
                                <Textarea
                                    id="app-description"
                                    value={appDescription}
                                    onChange={(e) =>
                                        setAppDescription(e.target.value)
                                    }
                                    placeholder={t("Enter app description")}
                                    className="min-h-[80px]"
                                    rows={3}
                                />
                            </div>
                        </>
                    )}

                    {/* Published Link */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">
                            {t("Published Link")}
                        </Label>
                        <div className="flex items-center gap-2">
                            <Input
                                value={publishedLink}
                                readOnly
                                className="flex-1 bg-gray-50 dark:bg-gray-800"
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCopy}
                                className="shrink-0"
                            >
                                {copied ? (
                                    <Check className="w-4 h-4" />
                                ) : (
                                    <Copy className="w-4 h-4" />
                                )}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleOpen}
                                className="shrink-0"
                            >
                                <ExternalLink className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                            <p className="text-sm text-red-600 dark:text-red-400">
                                {error}
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex gap-2">
                    <Button variant="outline" onClick={onClose}>
                        {t("Close")}
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={onUnpublish}
                        disabled={isPending || hasChanges}
                        className="flex items-center gap-2"
                    >
                        <Trash2 className="w-4 h-4" />
                        {isPending ? t("Unpublishing...") : t("Unpublish")}
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!hasChanges || !isFormValid || isSaving}
                    >
                        {isSaving ? t("Saving...") : t("Save Changes")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
