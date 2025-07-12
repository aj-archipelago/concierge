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
import { AlertTriangle, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import * as Icons from "lucide-react";
import { getUniqueLucideIcons } from "@/lib/utils";

export default function PublishConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    isPending = false,
    versionNumber,
}) {
    const { t } = useTranslation();
    const [publishToAppStore, setPublishToAppStore] = useState(false);
    const [appName, setAppName] = useState("");
    const [selectedIcon, setSelectedIcon] = useState("AppWindow");
    const [iconSearch, setIconSearch] = useState("");
    const [showIconSelector, setShowIconSelector] = useState(false);

    const handleConfirm = () => {
        if (publishToAppStore && !appName.trim()) {
            return; // Don't proceed if app store is selected but no name provided
        }
        onConfirm(publishToAppStore, appName.trim(), selectedIcon);
    };

    const isFormValid = !publishToAppStore || appName.trim().length > 0;

    // Get unique icons without aliases
    const uniqueIcons = getUniqueLucideIcons(Icons);

    // Filter icons based on search
    const filteredIcons = uniqueIcons
        .filter((iconName) =>
            iconName.toLowerCase().includes(iconSearch.toLowerCase()),
        )
        .slice(0, 50); // Limit to 50 icons for performance

    const SelectedIconComponent = Icons[selectedIcon] || Icons.AppWindow;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                        {t("Confirm Publish")}
                    </DialogTitle>
                    <DialogDescription className="space-y-3">
                        <p>
                            {t(
                                "Are you sure you want to publish version {{versionNumber}}?",
                                { versionNumber },
                            )}
                        </p>
                        <div className="flex items-start space-x-2 pt-2">
                            <Checkbox
                                id="publish-to-app-store"
                                checked={publishToAppStore}
                                onCheckedChange={setPublishToAppStore}
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
                                        onChange={(e) =>
                                            setAppName(e.target.value)
                                        }
                                        placeholder={t(
                                            "Enter a name for your app",
                                        )}
                                        className="w-full"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">
                                        {t("App Icon")}
                                    </Label>
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center justify-center w-10 h-10 border rounded-lg bg-gray-50">
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
                                                    placeholder={t(
                                                        "Search icons...",
                                                    )}
                                                    value={iconSearch}
                                                    onChange={(e) =>
                                                        setIconSearch(
                                                            e.target.value,
                                                        )
                                                    }
                                                    className="pl-10"
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
                                                                    key={
                                                                        iconName
                                                                    }
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setSelectedIcon(
                                                                            iconName,
                                                                        );
                                                                        setShowIconSelector(
                                                                            false,
                                                                        );
                                                                    }}
                                                                    className={`p-2 rounded hover:bg-gray-100 transition-colors ${
                                                                        selectedIcon ===
                                                                        iconName
                                                                            ? "bg-blue-100 border border-blue-300"
                                                                            : ""
                                                                    }`}
                                                                    title={
                                                                        iconName
                                                                    }
                                                                >
                                                                    <IconComponent className="w-4 h-4" />
                                                                </button>
                                                            );
                                                        },
                                                    )
                                                ) : (
                                                    <div className="col-span-8 flex items-center justify-center py-8 text-gray-500 text-sm">
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
                        <p className="text-xs text-muted-foreground">
                            {publishToAppStore
                                ? t(
                                      "Your app will be publicly available to all users of this platform.",
                                  )
                                : t(
                                      "Your app will only be accessible to people you share the link with.",
                                  )}
                        </p>
                    </DialogDescription>
                </DialogHeader>
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
                        {isPending ? t("Publishing...") : t("Publish")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
