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
import { Search, Trash2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import * as Icons from "lucide-react";
import { getUniqueLucideIcons } from "@/lib/utils";
import UserAvatar from "@/src/components/UserAvatar";
import UserPicker from "@/components/share/UserPicker";
import { useShareSettings } from "@/components/share/useShareSettings";

const PUBLISH_MODES = {
    LINK: "link",
    RECIPIENTS: "recipients",
    APP_STORE: "app_store",
};

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
    const [publishMode, setPublishMode] = useState(PUBLISH_MODES.LINK);
    const [appName, setAppName] = useState("");
    const [appSlug, setAppSlug] = useState("");
    const [appDescription, setAppDescription] = useState("");
    const [selectedIcon, setSelectedIcon] = useState("AppWindow");
    const [iconSearch, setIconSearch] = useState("");
    const [showIconSelector, setShowIconSelector] = useState(false);
    const [recipients, setRecipients] = useState([]);
    const [error, setError] = useState("");
    const searchInputRef = useRef(null);

    const existingApp = appletRecord?.app;
    const appletId = appletRecord?._id ? String(appletRecord._id) : null;
    const { data: shareData } = useShareSettings("applet", appletId, {
        enabled: isOpen && Boolean(appletId),
    });

    const publishToAppStore = publishMode === PUBLISH_MODES.APP_STORE;

    // Prefill form when dialog opens
    useEffect(() => {
        if (isOpen) {
            const isAppStorePublished =
                existingApp?.status === "active" &&
                existingApp?.listedInStore !== false;
            if (isAppStorePublished) {
                setPublishMode(PUBLISH_MODES.APP_STORE);
            } else if (shareData?.link?.enabled) {
                setPublishMode(PUBLISH_MODES.LINK);
            } else if ((shareData?.recipients || []).length > 0) {
                setPublishMode(PUBLISH_MODES.RECIPIENTS);
            } else {
                setPublishMode(PUBLISH_MODES.LINK);
            }

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
    }, [isOpen, appletRecord, existingApp, shareData]);

    useEffect(() => {
        if (!isOpen) return;
        setRecipients(
            (shareData?.recipients || []).map((recipient) => ({
                userId: String(recipient.userId),
                role: recipient.role || "viewer",
                user: recipient.user || null,
            })),
        );
    }, [isOpen, shareData]);

    // Reset form when dialog closes
    useEffect(() => {
        if (!isOpen) {
            setAppletName("");
            setAppName("");
            setAppSlug("");
            setAppDescription("");
            setSelectedIcon("AppWindow");
            setPublishMode(PUBLISH_MODES.LINK);
            setIconSearch("");
            setShowIconSelector(false);
            setRecipients([]);
            setError("");
        }
    }, [isOpen]);

    // Focus search input when icon selector opens
    useEffect(() => {
        if (showIconSelector && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [showIconSelector]);

    const handleAddRecipient = (user) => {
        setRecipients((prev) => {
            if (
                prev.some((entry) => String(entry.userId) === String(user._id))
            ) {
                return prev;
            }
            return [
                ...prev,
                {
                    userId: String(user._id),
                    role: "viewer",
                    user: {
                        _id: user._id,
                        name: user.name,
                        username: user.username,
                        profilePicture: user.profilePicture,
                    },
                },
            ];
        });
    };

    const handleRemoveRecipient = (userId) => {
        setRecipients((prev) =>
            prev.filter((entry) => String(entry.userId) !== String(userId)),
        );
    };

    const handleConfirm = async () => {
        if (
            publishToAppStore &&
            (!appName.trim() || !appSlug.trim() || !appDescription.trim())
        ) {
            return;
        }

        if (
            publishMode === PUBLISH_MODES.RECIPIENTS &&
            recipients.length === 0
        ) {
            setError(
                t("Select at least one person to publish this applet to."),
            );
            return;
        }

        setError("");

        try {
            await onConfirm({
                appletName: appletName.trim(),
                publishMode,
                publishToAppStore,
                publishViaLink: publishMode === PUBLISH_MODES.LINK,
                appName: appName.trim(),
                appIcon: selectedIcon,
                appSlug: appSlug.trim(),
                appDescription: appDescription.trim(),
                publishRecipients:
                    publishMode === PUBLISH_MODES.RECIPIENTS
                        ? recipients.map(({ userId, role }) => ({
                              userId,
                              role,
                          }))
                        : undefined,
            });
        } catch (confirmError) {
            const errorMessage =
                confirmError?.response?.data?.error ||
                confirmError?.data?.error ||
                confirmError?.message ||
                "An error occurred while publishing";
            setError(errorMessage);
        }
    };

    const isFormValid =
        appletName.trim().length > 0 &&
        (publishMode === PUBLISH_MODES.LINK ||
            publishMode === PUBLISH_MODES.RECIPIENTS ||
            (appName.trim().length > 0 &&
                appSlug.trim().length > 0 &&
                appDescription.trim().length > 0)) &&
        (publishMode !== PUBLISH_MODES.RECIPIENTS || recipients.length > 0);

    const uniqueIcons = getUniqueLucideIcons(Icons);

    const filteredIcons = uniqueIcons
        .filter((iconName) =>
            iconName.toLowerCase().includes(iconSearch.toLowerCase()),
        )
        .slice(0, 50);

    const SelectedIconComponent = Icons[selectedIcon] || Icons.AppWindow;

    const footerHint =
        publishMode === PUBLISH_MODES.APP_STORE
            ? t(
                  "Your app will be publicly available to all users of this platform.",
              )
            : publishMode === PUBLISH_MODES.LINK
              ? t(
                    "Anyone with the link can open the published applet. It will not appear in the Applet Store.",
                )
              : t(
                    "Only the people you add above can open the published applet.",
                );

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

                    {/* Publish visibility */}
                    <fieldset className="space-y-2">
                        <legend className="text-sm font-medium">
                            {t("Who can access the published applet?")}
                        </legend>
                        <div className="space-y-2">
                            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 p-3 has-[:checked]:border-sky-400 has-[:checked]:bg-sky-50 dark:border-gray-700 dark:has-[:checked]:border-sky-600 dark:has-[:checked]:bg-sky-950/30">
                                <input
                                    type="radio"
                                    name="publish-mode"
                                    value={PUBLISH_MODES.LINK}
                                    checked={publishMode === PUBLISH_MODES.LINK}
                                    onChange={() =>
                                        setPublishMode(PUBLISH_MODES.LINK)
                                    }
                                    className="mt-0.5"
                                />
                                <span className="text-sm leading-relaxed">
                                    <span className="font-medium">
                                        {t("Anyone with the link")}
                                    </span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                        {t(
                                            "Public via a direct link, but not listed in the Applet Store.",
                                        )}
                                    </span>
                                </span>
                            </label>
                            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 p-3 has-[:checked]:border-sky-400 has-[:checked]:bg-sky-50 dark:border-gray-700 dark:has-[:checked]:border-sky-600 dark:has-[:checked]:bg-sky-950/30">
                                <input
                                    type="radio"
                                    name="publish-mode"
                                    value={PUBLISH_MODES.RECIPIENTS}
                                    checked={
                                        publishMode === PUBLISH_MODES.RECIPIENTS
                                    }
                                    onChange={() =>
                                        setPublishMode(PUBLISH_MODES.RECIPIENTS)
                                    }
                                    className="mt-0.5"
                                />
                                <span className="text-sm leading-relaxed">
                                    <span className="font-medium">
                                        {t("Specific people")}
                                    </span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                        {t(
                                            "Only selected Concierge users can open the published applet.",
                                        )}
                                    </span>
                                </span>
                            </label>
                            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 p-3 has-[:checked]:border-sky-400 has-[:checked]:bg-sky-50 dark:border-gray-700 dark:has-[:checked]:border-sky-600 dark:has-[:checked]:bg-sky-950/30">
                                <input
                                    type="radio"
                                    name="publish-mode"
                                    value={PUBLISH_MODES.APP_STORE}
                                    checked={
                                        publishMode === PUBLISH_MODES.APP_STORE
                                    }
                                    onChange={() =>
                                        setPublishMode(PUBLISH_MODES.APP_STORE)
                                    }
                                    className="mt-0.5"
                                />
                                <span className="text-sm leading-relaxed">
                                    <span className="font-medium">
                                        {t("Applet Store")}
                                    </span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                        {t(
                                            "Listed for everyone using this site in Applet Library → Discover.",
                                        )}
                                    </span>
                                </span>
                            </label>
                        </div>
                    </fieldset>

                    {publishMode === PUBLISH_MODES.RECIPIENTS ? (
                        <div className="space-y-3 rounded-md border border-gray-200 p-3 dark:border-gray-700">
                            <div>
                                <Label className="text-sm font-medium">
                                    {t("Share with specific people")}
                                </Label>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {t(
                                        "Your app will be available only to the people you select below. They will receive a notification.",
                                    )}
                                </p>
                            </div>
                            <UserPicker
                                onSelect={handleAddRecipient}
                                excludeIds={recipients.map(
                                    (recipient) => recipient.userId,
                                )}
                                placeholder={t(
                                    "Search people to share with...",
                                )}
                            />
                            <div className="max-h-40 space-y-1 overflow-auto">
                                {recipients.length === 0 ? (
                                    <p className="py-2 text-center text-xs text-gray-500 dark:text-gray-400">
                                        {t("No one added yet.")}
                                    </p>
                                ) : (
                                    recipients.map((recipient) => (
                                        <div
                                            key={recipient.userId}
                                            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                        >
                                            <UserAvatar
                                                src={
                                                    recipient.user
                                                        ?.profilePicture
                                                }
                                                name={recipient.user?.name}
                                                className="h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-gray-200 text-xs dark:bg-gray-700"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-medium">
                                                    {recipient.user?.name ||
                                                        recipient.user
                                                            ?.username ||
                                                        t("Unknown user")}
                                                </div>
                                                {recipient.user?.username ? (
                                                    <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                                                        {
                                                            recipient.user
                                                                .username
                                                        }
                                                    </div>
                                                ) : null}
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    handleRemoveRecipient(
                                                        recipient.userId,
                                                    )
                                                }
                                                aria-label={t("Remove")}
                                            >
                                                <Trash2 className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    ) : null}

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
                                            <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
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
                        {footerHint}
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
