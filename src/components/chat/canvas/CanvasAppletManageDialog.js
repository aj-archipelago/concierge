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
import { ServerContext } from "@/src/App";

function slugifyAppName(name) {
    return (name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

export default function CanvasAppletManageDialog({
    isOpen,
    onClose,
    onUnpublish,
    appletRecord,
    onAppUpdated,
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
    const [showAppStoreForm, setShowAppStoreForm] = useState(false);

    const app = appletRecord?.app;
    const isAppStorePublished = app?.slug && app?.status === "active";
    const defaultAppName = appletRecord?.name || "";

    const publishedLink = isAppStorePublished
        ? `${serverContext.serverUrl}/apps/${app.slug}`
        : `${serverContext.serverUrl}/published/applets/${appletRecord?._id}`;

    // Prefill form when dialog opens
    useEffect(() => {
        if (isOpen) {
            const resolvedName = app?.name || defaultAppName;
            setAppName(resolvedName);
            setAppSlug(app?.slug || slugifyAppName(resolvedName));
            setAppDescription(app?.description || "");
        }
    }, [isOpen, app, defaultAppName]);

    // Reset form when dialog closes
    useEffect(() => {
        if (!isOpen) {
            setAppName("");
            setAppSlug("");
            setAppDescription("");
            setCopied(false);
            setIsSaving(false);
            setError("");
            setShowAppStoreForm(false);
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
        if (!appName.trim() || !appSlug.trim() || !appDescription.trim())
            return;

        setIsSaving(true);
        setError("");

        try {
            const res = await fetch(`/api/canvas-applets/${appletRecord._id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    publishToAppStore: true,
                    appName: appName.trim(),
                    appSlug: appSlug.trim(),
                    appDescription: appDescription.trim(),
                    appIcon: app?.icon || "AppWindow",
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to update app");
            }

            if (onAppUpdated) {
                await onAppUpdated();
            }
        } catch (error) {
            console.error("Failed to update app:", error);
            setError(error.message || "Failed to update app");
        } finally {
            setIsSaving(false);
        }
    };

    const isFormValid =
        appName.trim().length > 0 &&
        appSlug.trim().length > 0 &&
        appDescription.trim().length > 0;
    const shouldShowAppStoreForm = isAppStorePublished || showAppStoreForm;
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
                    <DialogTitle>{t("Manage Published Applet")}</DialogTitle>
                    <DialogDescription>
                        {isAppStorePublished
                            ? t(
                                  "Edit your app details or manage publication settings.",
                              )
                            : t(
                                  "Your applet has been published. Share the direct link or add it to the app store.",
                              )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {shouldShowAppStoreForm && (
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
                                aria-label={
                                    copied ? t("Copied") : t("Copy link")
                                }
                                title={copied ? t("Copied") : t("Copy link")}
                            >
                                {copied ? (
                                    <Check
                                        className="w-4 h-4"
                                        aria-hidden="true"
                                    />
                                ) : (
                                    <Copy
                                        className="w-4 h-4"
                                        aria-hidden="true"
                                    />
                                )}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleOpen}
                                className="shrink-0"
                                aria-label={t("Open link in new tab")}
                                title={t("Open link in new tab")}
                            >
                                <ExternalLink
                                    className="w-4 h-4"
                                    aria-hidden="true"
                                />
                            </Button>
                        </div>
                    </div>

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
                        disabled={isPending || isSaving}
                        className="flex items-center gap-2"
                    >
                        <Trash2 className="w-4 h-4" />
                        {isPending ? t("Unpublishing...") : t("Unpublish")}
                    </Button>
                    {isAppStorePublished && (
                        <Button
                            onClick={handleSave}
                            disabled={!hasChanges || !isFormValid || isSaving}
                        >
                            {isSaving ? t("Saving...") : t("Save Changes")}
                        </Button>
                    )}
                    {!isAppStorePublished && (
                        <Button
                            onClick={
                                showAppStoreForm
                                    ? handleSave
                                    : () => setShowAppStoreForm(true)
                            }
                            disabled={
                                showAppStoreForm
                                    ? !isFormValid || isSaving
                                    : isSaving
                            }
                        >
                            {isSaving
                                ? t("Publishing...")
                                : showAppStoreForm
                                  ? t("Publish to App Store")
                                  : t("Add to App Store")}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
