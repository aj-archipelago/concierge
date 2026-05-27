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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import * as Icons from "lucide-react";
import { getUniqueLucideIcons } from "@/lib/utils";

export default function CanvasAppletPublishDialog({
    isOpen,
    onClose,
    onConfirm,
    isPending = false,
    appletRecord,
    isUpdate = false,
}) {
    const { t } = useTranslation();
    const [appletName, setAppletName] = useState("");
    const [publishToAppStore, setPublishToAppStore] = useState(false);
    const [appName, setAppName] = useState("");
    const [appSlug, setAppSlug] = useState("");
    const [appDescription, setAppDescription] = useState("");
    const [selectedIcon, setSelectedIcon] = useState("AppWindow");
    const [iconSearch, setIconSearch] = useState("");
    const [showIconSelector, setShowIconSelector] = useState(false);
    const [error, setError] = useState("");
    const searchInputRef = useRef(null);

    const existingApp = appletRecord?.app;

    // Prefill form when dialog opens
    useEffect(() => {
        if (isOpen) {
            const isCurrentlyPublished = existingApp?.status === "active";
            setPublishToAppStore(isCurrentlyPublished || false);

            setAppletName(appletRecord?.name || "");

            if (existingApp?.name) {
                setAppName(existingApp.name);
            } else if (appletRecord?.name) {
                setAppName(appletRecord.name);
            }
            if (existingApp?.icon) {
                setSelectedIcon(existingApp.icon);
            }
            if (existingApp?.slug) {
                setAppSlug(existingApp.slug);
            } else if (appletRecord?.name) {
                setAppSlug(
                    appletRecord.name
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, ""),
                );
            }
            if (existingApp?.description) {
                setAppDescription(existingApp.description);
            }
        }
    }, [isOpen, appletRecord, existingApp]);

    // Reset form when dialog closes
    useEffect(() => {
        if (!isOpen) {
            setAppletName("");
            setAppName("");
            setAppSlug("");
            setAppDescription("");
            setSelectedIcon("AppWindow");
            setPublishToAppStore(false);
            setIconSearch("");
            setShowIconSelector(false);
            setError("");
        }
    }, [isOpen]);

    // Focus search input when icon selector opens
    useEffect(() => {
        if (showIconSelector && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [showIconSelector]);

    const handleConfirm = async () => {
        if (
            publishToAppStore &&
            (!appName.trim() || !appSlug.trim() || !appDescription.trim())
        ) {
            return;
        }

        setError("");

        try {
            await onConfirm({
                appletName: appletName.trim(),
                publishToAppStore,
                appName: appName.trim(),
                appIcon: selectedIcon,
                appSlug: appSlug.trim(),
                appDescription: appDescription.trim(),
            });
        } catch (error) {
            const errorMessage =
                error?.response?.data?.error ||
                error?.data?.error ||
                error?.message ||
                "An error occurred while publishing";
            setError(errorMessage);
        }
    };

    const isFormValid =
        appletName.trim().length > 0 &&
        (!publishToAppStore ||
            (appName.trim().length > 0 &&
                appSlug.trim().length > 0 &&
                appDescription.trim().length > 0));

    const uniqueIcons = getUniqueLucideIcons(Icons);

    const filteredIcons = uniqueIcons
        .filter((iconName) =>
            iconName.toLowerCase().includes(iconSearch.toLowerCase()),
        )
        .slice(0, 50);

    const SelectedIconComponent = Icons[selectedIcon] || Icons.AppWindow;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {isUpdate
                            ? t("Update Published Applet")
                            : t("Publish Applet")}
                    </DialogTitle>
                    <DialogDescription>
                        {isUpdate
                            ? t(
                                  "Update the published version with your latest changes.",
                              )
                            : t(
                                  "Configure your applet details before publishing.",
                              )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Applet Name */}
                    <div className="space-y-2">
                        <Label
                            htmlFor="applet-name"
                            className="text-sm font-medium"
                        >
                            {t("Applet Name *")}
                        </Label>
                        <Input
                            id="applet-name"
                            value={appletName}
                            onChange={(e) => setAppletName(e.target.value)}
                            placeholder={t("Enter a name for your applet")}
                            className="w-full"
                        />
                    </div>

                    {/* Publish to app store */}
                    <div className="flex items-start space-x-2">
                        <Checkbox
                            id="publish-to-app-store"
                            checked={publishToAppStore}
                            onCheckedChange={(checked) =>
                                setPublishToAppStore(checked === true)
                            }
                        />
                        <label
                            htmlFor="publish-to-app-store"
                            className="text-sm leading-relaxed cursor-pointer"
                        >
                            {t(
                                "Publish to app store (everyone using this site will be able to access the app)",
                            )}
                        </label>
                    </div>

                    {publishToAppStore && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label
                                    htmlFor="app-name"
                                    className="text-sm font-medium"
                                >
                                    {t("App Name *")}
                                </Label>
                                <Input
                                    id="app-name"
                                    value={appName}
                                    onChange={(e) => setAppName(e.target.value)}
                                    placeholder={t("Enter a name for your app")}
                                    className="w-full"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label
                                    htmlFor="app-slug"
                                    className="text-sm font-medium"
                                >
                                    {t("App Slug *")}
                                </Label>
                                <Input
                                    id="app-slug"
                                    value={appSlug}
                                    onChange={(e) => setAppSlug(e.target.value)}
                                    placeholder={t(
                                        "Enter a slug for your app URL",
                                    )}
                                    className="w-full"
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
                                    {t("App Description *")}
                                </Label>
                                <Textarea
                                    id="app-description"
                                    value={appDescription}
                                    onChange={(e) =>
                                        setAppDescription(e.target.value)
                                    }
                                    placeholder={t(
                                        "Enter a description for your app",
                                    )}
                                    className="w-full min-h-[80px]"
                                    rows={3}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-medium">
                                    {t("App Icon")}
                                </Label>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center justify-center w-10 h-10 border rounded-lg bg-gray-50 dark:bg-gray-700">
                                        <SelectedIconComponent className="w-5 h-5" />
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            setShowIconSelector(
                                                !showIconSelector,
                                            )
                                        }
                                    >
                                        {showIconSelector
                                            ? t("Hide Icons")
                                            : t("Choose Icon")}
                                    </Button>
                                </div>

                                {showIconSelector && (
                                    <div className="space-y-2">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <Input
                                                ref={searchInputRef}
                                                placeholder={t(
                                                    "Search icons...",
                                                )}
                                                value={iconSearch}
                                                onChange={(e) =>
                                                    setIconSearch(
                                                        e.target.value,
                                                    )
                                                }
                                                className="ps-10"
                                            />
                                        </div>
                                        <div className="grid grid-cols-8 gap-2 max-h-40 overflow-y-auto border rounded-lg p-2">
                                            {filteredIcons.length > 0 ? (
                                                filteredIcons.map(
                                                    (iconName) => {
                                                        const IconComponent =
                                                            Icons[iconName];
                                                        return (
                                                            <button
                                                                key={iconName}
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedIcon(
                                                                        iconName,
                                                                    );
                                                                    setShowIconSelector(
                                                                        false,
                                                                    );
                                                                }}
                                                                className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors ${
                                                                    selectedIcon ===
                                                                    iconName
                                                                        ? "bg-sky-100 border border-sky-300 dark:bg-sky-900/30 dark:border-sky-600"
                                                                        : ""
                                                                }`}
                                                                title={iconName}
                                                                aria-label={
                                                                    iconName
                                                                }
                                                            >
                                                                <IconComponent
                                                                    className="w-4 h-4"
                                                                    aria-hidden="true"
                                                                />
                                                            </button>
                                                        );
                                                    },
                                                )
                                            ) : (
                                                <div className="col-span-8 flex items-center justify-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                                                    {t(
                                                        'No icons found matching "{{searchTerm}}"',
                                                        {
                                                            searchTerm:
                                                                iconSearch,
                                                        },
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                            <p className="text-sm text-red-600 dark:text-red-400">
                                {error}
                            </p>
                        </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                        {publishToAppStore
                            ? t(
                                  "Your app will be publicly available to all users of this platform.",
                              )
                            : t(
                                  "Your app will only be accessible to people you share the link with.",
                              )}
                    </p>
                </div>

                <DialogFooter className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={isPending}
                    >
                        {t("Cancel")}
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={isPending || !isFormValid}
                        className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
                    >
                        {isPending
                            ? t("Publishing...")
                            : isUpdate
                              ? t("Update")
                              : t("Publish")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
