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
import { cn, getUniqueLucideIcons } from "@/lib/utils";
import { AppWindow, Loader2, Moon, Search, Sparkles, Sun } from "lucide-react";
import * as Icons from "lucide-react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageContext } from "@/src/contexts/LanguageProvider";
import { ThemeContext } from "@/src/contexts/ThemeProvider";
import AppCatalogCard from "./AppCatalogCard";

const IMAGE_POLL_INTERVAL_MS = 1000;
const IMAGE_POLL_ATTEMPTS = 90;
const MEDIA_URL_RETRY_ATTEMPTS = 8;

export function slugifyAppletMetadata(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function appletIdOf(applet) {
    return applet?.appletId || applet?._id || applet?.raw?._id || null;
}

function normalizeTagsInput(value) {
    if (Array.isArray(value)) return value.join(", ");
    return value || "";
}

function formFromApplet(applet) {
    const app = applet?.app || applet?.raw?.app || {};
    const name = app.name || applet?.name || applet?.raw?.name || "";
    return {
        name,
        slug: app.slug || slugifyAppletMetadata(name),
        description: app.description || "",
        badgeLabel: app.badgeLabel || "",
        icon: app.icon || "AppWindow",
        imageUrl: app.imageUrl || "",
        imageLightUrl: app.imageLightUrl || app.imageUrl || "",
        imageDarkUrl: app.imageDarkUrl || app.imageUrl || "",
        imageAlt: app.imageAlt || "",
        tags: normalizeTagsInput(app.tags),
        category: app.category || "",
        metadataGeneratedAt: app.metadataGeneratedAt || null,
    };
}

function tagsToArray(value) {
    return String(value || "")
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8);
}

function metadataPayloadFromForm(form) {
    const imageLightUrl = form.imageLightUrl.trim();
    const imageDarkUrl = form.imageDarkUrl.trim();
    return {
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim(),
        badgeLabel: form.badgeLabel.trim(),
        icon: form.icon,
        imageUrl: imageLightUrl || imageDarkUrl || form.imageUrl.trim(),
        imageLightUrl,
        imageDarkUrl,
        imageAlt: form.imageAlt.trim(),
        tags: tagsToArray(form.tags),
        category: form.category.trim(),
        metadataGeneratedAt: form.metadataGeneratedAt,
    };
}

function normalizePreviewTheme(theme) {
    return theme === "dark" ? "dark" : "light";
}

function getMediaUrl(value) {
    return value?.azureUrl || value?.url || value?.gcsUrl || "";
}

function FieldShell({ label, htmlFor, children, className }) {
    return (
        <div className={cn("min-w-0 space-y-1.5", className)}>
            <Label htmlFor={htmlFor} className="text-xs font-semibold">
                {label}
            </Label>
            {children}
        </div>
    );
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonOrThrow(url, options, fallbackMessage) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || data.message || fallbackMessage);
    }
    return data;
}

export default function AppletMetadataDialog({
    applet,
    isOpen,
    onClose,
    onSaved,
}) {
    const { t } = useTranslation();
    const { direction = "ltr" } = useContext(LanguageContext) || {};
    const { theme: appTheme = "light" } = useContext(ThemeContext) || {};
    const [form, setForm] = useState(() => formFromApplet(applet));
    const [iconSearch, setIconSearch] = useState("");
    const [showIconSelector, setShowIconSelector] = useState(false);
    const [previewTheme, setPreviewTheme] = useState("light");
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [error, setError] = useState("");
    const searchInputRef = useRef(null);
    const imageGenerationRequestRef = useRef(0);
    const appletId = appletIdOf(applet);
    const SelectedIcon = Icons[form.icon] || AppWindow;
    const previewTitle = form.name.trim() || t("Untitled Applet");
    const previewDescription =
        form.description.trim() || t("Enter app description");
    const previewCategory = form.category.trim();
    const previewTags = tagsToArray(form.tags);

    useEffect(() => {
        if (isOpen) {
            setForm(formFromApplet(applet));
            setError("");
            setIconSearch("");
            setShowIconSelector(false);
            setPreviewTheme(normalizePreviewTheme(appTheme));
        } else {
            imageGenerationRequestRef.current += 1;
            setIsGeneratingImage(false);
        }
    }, [applet, appTheme, isOpen]);

    useEffect(() => {
        if (showIconSelector) {
            searchInputRef.current?.focus();
        }
    }, [showIconSelector]);

    const uniqueIcons = useMemo(() => getUniqueLucideIcons(Icons), []);
    const filteredIcons = useMemo(
        () =>
            uniqueIcons
                .filter((iconName) =>
                    iconName.toLowerCase().includes(iconSearch.toLowerCase()),
                )
                .slice(0, 64),
        [iconSearch, uniqueIcons],
    );

    const setField = (field, value) => {
        setForm((current) => ({
            ...current,
            [field]: value,
            ...(field === "name" && !current.slug
                ? { slug: slugifyAppletMetadata(value) }
                : {}),
        }));
    };

    const handleGenerate = async () => {
        if (!appletId) return;
        setIsGenerating(true);
        setError("");
        try {
            const response = await fetch(
                `/api/canvas-applets/${appletId}/metadata/generate`,
                { method: "POST" },
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(
                    data.error || t("Failed to generate applet metadata"),
                );
            }
            const metadata = data.metadata || {};
            setForm((current) => ({
                ...current,
                name: metadata.name || current.name,
                slug:
                    metadata.slug ||
                    current.slug ||
                    slugifyAppletMetadata(metadata.name),
                description: metadata.description || current.description,
                badgeLabel: metadata.badgeLabel || current.badgeLabel,
                icon: metadata.icon || current.icon,
                tags: normalizeTagsInput(metadata.tags) || current.tags,
                category: metadata.category || current.category,
                metadataGeneratedAt:
                    metadata.metadataGeneratedAt || new Date().toISOString(),
            }));
        } catch (error) {
            console.error("Failed to generate applet metadata:", error);
            setError(error.message || t("Failed to generate applet metadata"));
        } finally {
            setIsGenerating(false);
        }
    };

    const pollGeneratedImageUrl = async (
        taskId,
        requestId,
        { cancelOnRequestChange = true } = {},
    ) => {
        let completedWithoutUrlAttempts = 0;

        for (let attempt = 0; attempt < IMAGE_POLL_ATTEMPTS; attempt += 1) {
            await delay(IMAGE_POLL_INTERVAL_MS);
            if (
                cancelOnRequestChange &&
                imageGenerationRequestRef.current !== requestId
            ) {
                return "";
            }

            const task = await fetchJsonOrThrow(
                `/api/tasks/${taskId}`,
                undefined,
                t("Failed to check generated applet image"),
            );
            const taskUrl = getMediaUrl(task?.data);
            if (taskUrl) return { imageUrl: taskUrl };

            if (task.status === "failed") {
                const taskError =
                    task.error?.message || task.error || t("Unknown error");
                return {
                    error: t("Image generation failed: {{error}}", {
                        error: String(taskError),
                    }),
                };
            }

            if (task.status === "completed") {
                const mediaData = await fetchJsonOrThrow(
                    "/api/media-items?page=1&limit=100",
                    undefined,
                    t("Failed to check generated applet image"),
                );
                const mediaItem = mediaData?.mediaItems?.find(
                    (item) => item.taskId === taskId,
                );
                const mediaUrl = getMediaUrl(mediaItem);
                if (mediaUrl) return { imageUrl: mediaUrl };

                completedWithoutUrlAttempts += 1;
                if (completedWithoutUrlAttempts >= MEDIA_URL_RETRY_ATTEMPTS) {
                    break;
                }
            }
        }

        return {
            error: t(
                "Image generation completed but the image URL could not be retrieved. The image may still be available on the Media page.",
            ),
        };
    };

    const saveQueuedLightImageUrl = async ({ imageDarkUrl, imageLightUrl }) => {
        const currentApplet = await fetchJsonOrThrow(
            `/api/canvas-applets/${appletId}`,
            undefined,
            t("Failed to save applet metadata"),
        );
        const currentApp = currentApplet?.app || {};
        const currentDarkUrl = currentApp.imageDarkUrl || currentApp.imageUrl;
        const currentLightUrl = currentApp.imageLightUrl;

        if (currentDarkUrl && currentDarkUrl !== imageDarkUrl) {
            return null;
        }
        if (
            currentLightUrl &&
            currentLightUrl !== imageDarkUrl &&
            currentLightUrl !== imageLightUrl
        ) {
            return null;
        }

        return fetchJsonOrThrow(
            `/api/canvas-applets/${appletId}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    appMetadata: { imageLightUrl },
                }),
            },
            t("Failed to save applet metadata"),
        );
    };

    const handleGenerateImage = async () => {
        if (!appletId || isGeneratingImage) return;
        const requestId = imageGenerationRequestRef.current + 1;
        imageGenerationRequestRef.current = requestId;
        setIsGeneratingImage(true);
        setError("");

        try {
            const darkData = await fetchJsonOrThrow(
                `/api/canvas-applets/${appletId}/image/generate`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        metadata: metadataPayloadFromForm(form),
                        variant: "dark",
                    }),
                },
                t("Failed to generate applet image"),
            );
            const darkTaskId =
                darkData.variants?.dark?.taskId || darkData.taskId;
            if (!darkTaskId) {
                throw new Error(t("Failed to generate applet image"));
            }

            const darkResult = await pollGeneratedImageUrl(
                darkTaskId,
                requestId,
            );
            if (imageGenerationRequestRef.current !== requestId) return;
            if (darkResult?.error) {
                setError(darkResult.error);
                return;
            }
            const imageDarkUrl = darkResult?.imageUrl || "";
            if (!imageDarkUrl) {
                setError(t("Failed to generate applet image"));
                return;
            }

            const metadataGeneratedAt = new Date().toISOString();
            const imageAlt =
                form.imageAlt ||
                t("Generated applet image for {{name}}", {
                    name: form.name || t("Untitled Applet"),
                });
            const darkMetadata = {
                imageUrl: imageDarkUrl,
                imageLightUrl: "",
                imageDarkUrl,
                imageAlt,
                metadataGeneratedAt,
            };

            setForm((current) => ({
                ...current,
                ...darkMetadata,
            }));
            let savedApplet = await fetchJsonOrThrow(
                `/api/canvas-applets/${appletId}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        appMetadata: darkMetadata,
                    }),
                },
                t("Failed to save applet metadata"),
            );
            await onSaved?.(savedApplet);

            const generateLightImage = async () => {
                const lightData = await fetchJsonOrThrow(
                    `/api/canvas-applets/${appletId}/image/generate`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            metadata: metadataPayloadFromForm(form),
                            variant: "light",
                            referenceImageUrl: imageDarkUrl,
                            cleanupExisting: false,
                        }),
                    },
                    t("Failed to generate applet image"),
                );
                const lightTaskId =
                    lightData.variants?.light?.taskId || lightData.taskId;
                if (!lightTaskId) return;

                const lightResult = await pollGeneratedImageUrl(
                    lightTaskId,
                    requestId,
                    { cancelOnRequestChange: false },
                );
                if (lightResult?.error) {
                    console.warn(
                        "Light applet image generation failed:",
                        lightResult.error,
                    );
                    return;
                }
                const imageLightUrl = lightResult?.imageUrl || "";
                if (!imageLightUrl) return;

                savedApplet = await saveQueuedLightImageUrl({
                    imageDarkUrl,
                    imageLightUrl,
                });
                if (!savedApplet) return;
                if (imageGenerationRequestRef.current === requestId) {
                    setForm((current) => ({
                        ...current,
                        imageLightUrl,
                    }));
                }
                await onSaved?.(savedApplet);
            };
            void generateLightImage().catch((lightError) => {
                console.warn(
                    "Light applet image generation failed:",
                    lightError?.message || lightError,
                );
            });
        } catch (error) {
            if (imageGenerationRequestRef.current !== requestId) return;
            console.warn(
                "Failed to generate applet image:",
                error?.message || error,
            );
            setError(error.message || t("Failed to generate applet image"));
        } finally {
            if (imageGenerationRequestRef.current === requestId) {
                setIsGeneratingImage(false);
            }
        }
    };

    const handleSave = async () => {
        if (!appletId || !form.name.trim() || !form.slug.trim()) return;
        setIsSaving(true);
        setError("");
        try {
            const response = await fetch(`/api/canvas-applets/${appletId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    appMetadata: metadataPayloadFromForm(form),
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(
                    data.error || t("Failed to save applet metadata"),
                );
            }
            await onSaved?.(data);
            onClose?.();
        } catch (error) {
            console.error("Failed to save applet metadata:", error);
            setError(error.message || t("Failed to save applet metadata"));
        } finally {
            setIsSaving(false);
        }
    };

    const isValid = form.name.trim().length > 0 && form.slug.trim().length > 0;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent
                dir={direction}
                className="z-[2147483647] grid h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:h-[min(90vh,760px)] sm:rounded-xl"
            >
                <DialogHeader className="border-b border-gray-200 bg-white px-4 py-4 pe-12 text-start dark:border-gray-700 dark:bg-gray-900 sm:px-6">
                    <DialogTitle className="text-xl">
                        {t("Edit applet metadata")}
                    </DialogTitle>
                    <DialogDescription className="mt-1 max-w-3xl">
                        {t(
                            "Set the applet card details used on applet lists, the app catalog, and installed sidebar entries.",
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 overflow-y-auto bg-gray-50 dark:bg-gray-950">
                    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)] lg:p-6">
                        <aside className="space-y-3 lg:sticky lg:top-0 lg:self-start">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    {t("Card preview")}
                                </h3>
                                <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-900">
                                    {[
                                        {
                                            value: "light",
                                            label: t("Light"),
                                            icon: Sun,
                                        },
                                        {
                                            value: "dark",
                                            label: t("Dark"),
                                            icon: Moon,
                                        },
                                    ].map(({ value, label, icon: Icon }) => (
                                        <button
                                            key={value}
                                            type="button"
                                            aria-pressed={
                                                previewTheme === value
                                            }
                                            onClick={() =>
                                                setPreviewTheme(value)
                                            }
                                            className={cn(
                                                "inline-flex h-8 items-center gap-1.5 rounded px-2 text-xs font-semibold transition",
                                                previewTheme === value
                                                    ? "bg-sky-50 text-sky-700 shadow-sm dark:bg-sky-950/50 dark:text-sky-300"
                                                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100",
                                            )}
                                        >
                                            <Icon className="h-3.5 w-3.5" />
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <AppCatalogCard
                                title={previewTitle}
                                titleAttribute={previewTitle}
                                icon={SelectedIcon}
                                imageUrl={form.imageUrl}
                                imageLightUrl={form.imageLightUrl}
                                imageDarkUrl={form.imageDarkUrl}
                                imageAlt={form.imageAlt || previewTitle}
                                imageBadge={form.badgeLabel || previewCategory}
                                imageMeta={null}
                                meta={[]}
                                chips={[previewCategory, ...previewTags]}
                                description={previewDescription}
                                density="compact"
                                imageOverlayVariant="app-library"
                                themeOverride={previewTheme}
                            />

                            <div className="grid gap-2 sm:grid-cols-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleGenerate}
                                    disabled={
                                        isGenerating ||
                                        isGeneratingImage ||
                                        isSaving
                                    }
                                    className="w-full min-w-0 justify-center gap-2 whitespace-nowrap"
                                >
                                    {isGenerating ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Sparkles className="h-4 w-4" />
                                    )}
                                    {t("Generate Metadata")}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleGenerateImage}
                                    disabled={
                                        isGenerating ||
                                        isGeneratingImage ||
                                        isSaving
                                    }
                                    className="w-full min-w-0 justify-center gap-2 whitespace-nowrap"
                                >
                                    {isGeneratingImage ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Sparkles className="h-4 w-4" />
                                    )}
                                    {t("Generate Images")}
                                </Button>
                            </div>
                        </aside>

                        <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <FieldShell
                                    htmlFor="applet-metadata-name"
                                    label={t("Name")}
                                >
                                    <Input
                                        id="applet-metadata-name"
                                        value={form.name}
                                        onChange={(event) =>
                                            setField("name", event.target.value)
                                        }
                                        placeholder={t("Enter app name")}
                                    />
                                </FieldShell>
                                <FieldShell
                                    htmlFor="applet-metadata-slug"
                                    label={t("Slug")}
                                >
                                    <Input
                                        id="applet-metadata-slug"
                                        value={form.slug}
                                        onChange={(event) =>
                                            setField(
                                                "slug",
                                                slugifyAppletMetadata(
                                                    event.target.value,
                                                ),
                                            )
                                        }
                                        placeholder={t("Enter app slug")}
                                    />
                                </FieldShell>
                            </div>

                            <FieldShell
                                htmlFor="applet-metadata-description"
                                label={t("Description")}
                                className="mt-3"
                            >
                                <Textarea
                                    id="applet-metadata-description"
                                    value={form.description}
                                    onChange={(event) =>
                                        setField(
                                            "description",
                                            event.target.value,
                                        )
                                    }
                                    placeholder={t("Enter app description")}
                                    className="min-h-24"
                                />
                            </FieldShell>

                            <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                <FieldShell
                                    htmlFor="applet-metadata-category"
                                    label={t("Category")}
                                >
                                    <Input
                                        id="applet-metadata-category"
                                        value={form.category}
                                        onChange={(event) =>
                                            setField(
                                                "category",
                                                event.target.value,
                                            )
                                        }
                                        placeholder={t("Workflow")}
                                    />
                                </FieldShell>
                                <FieldShell
                                    htmlFor="applet-metadata-badge"
                                    label={t("Badge label")}
                                >
                                    <Input
                                        id="applet-metadata-badge"
                                        value={form.badgeLabel}
                                        onChange={(event) =>
                                            setField(
                                                "badgeLabel",
                                                event.target.value,
                                            )
                                        }
                                        placeholder={t("Arcade cabinet")}
                                    />
                                </FieldShell>
                                <FieldShell
                                    htmlFor="applet-metadata-tags"
                                    label={t("Tags")}
                                >
                                    <Input
                                        id="applet-metadata-tags"
                                        value={form.tags}
                                        onChange={(event) =>
                                            setField("tags", event.target.value)
                                        }
                                        placeholder={t("analytics, research")}
                                    />
                                </FieldShell>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(180px,220px)_minmax(0,1fr)]">
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold">
                                        {t("Icon")}
                                    </Label>
                                    <div className="flex min-w-0 items-center gap-2">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">
                                            <SelectedIcon className="h-5 w-5" />
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="min-w-0"
                                            onClick={() =>
                                                setShowIconSelector(
                                                    (current) => !current,
                                                )
                                            }
                                        >
                                            <span className="truncate">
                                                {showIconSelector
                                                    ? t("Hide Icons")
                                                    : t("Choose Icon")}
                                            </span>
                                        </Button>
                                    </div>
                                </div>
                                <div className="grid gap-3">
                                    <FieldShell
                                        htmlFor="applet-metadata-image-alt"
                                        label={t("Image alt text")}
                                    >
                                        <Input
                                            id="applet-metadata-image-alt"
                                            value={form.imageAlt}
                                            onChange={(event) =>
                                                setField(
                                                    "imageAlt",
                                                    event.target.value,
                                                )
                                            }
                                            placeholder={t(
                                                "Describe the image",
                                            )}
                                        />
                                    </FieldShell>
                                </div>
                            </div>

                            {showIconSelector && (
                                <div className="mt-4 space-y-2 rounded-md border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-950/50">
                                    <div className="relative">
                                        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                                        <Input
                                            ref={searchInputRef}
                                            placeholder={t("Search icons...")}
                                            value={iconSearch}
                                            onChange={(event) =>
                                                setIconSearch(
                                                    event.target.value,
                                                )
                                            }
                                            className="ps-9"
                                        />
                                    </div>
                                    <div className="grid max-h-48 grid-cols-6 gap-1 overflow-y-auto sm:grid-cols-8">
                                        {filteredIcons.map((iconName) => {
                                            const IconComponent =
                                                Icons[iconName];
                                            return (
                                                <button
                                                    key={iconName}
                                                    type="button"
                                                    onClick={() => {
                                                        setField(
                                                            "icon",
                                                            iconName,
                                                        );
                                                        setShowIconSelector(
                                                            false,
                                                        );
                                                    }}
                                                    className={cn(
                                                        "flex h-10 w-10 items-center justify-center rounded-md border text-gray-600 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800",
                                                        form.icon === iconName
                                                            ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                                                            : "border-transparent",
                                                    )}
                                                    title={iconName}
                                                    aria-label={iconName}
                                                >
                                                    <IconComponent className="h-4 w-4" />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    {t("Custom image URLs")}
                                </h3>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                    <FieldShell
                                        htmlFor="applet-metadata-image-light-url"
                                        label={t("Light image URL")}
                                    >
                                        <Input
                                            id="applet-metadata-image-light-url"
                                            value={form.imageLightUrl}
                                            onChange={(event) =>
                                                setField(
                                                    "imageLightUrl",
                                                    event.target.value,
                                                )
                                            }
                                            placeholder="https://..."
                                        />
                                    </FieldShell>
                                    <FieldShell
                                        htmlFor="applet-metadata-image-dark-url"
                                        label={t("Dark image URL")}
                                    >
                                        <Input
                                            id="applet-metadata-image-dark-url"
                                            value={form.imageDarkUrl}
                                            onChange={(event) =>
                                                setField(
                                                    "imageDarkUrl",
                                                    event.target.value,
                                                )
                                            }
                                            placeholder="https://..."
                                        />
                                    </FieldShell>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="mx-4 mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300 sm:mx-6">
                        {error}
                    </div>
                )}

                <DialogFooter className="gap-2 border-t border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-700 dark:bg-gray-900/60 sm:justify-end sm:space-x-0 sm:px-6">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={isSaving}
                    >
                        {t("Cancel")}
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSave}
                        disabled={
                            !isValid ||
                            isSaving ||
                            isGenerating ||
                            isGeneratingImage
                        }
                    >
                        {isSaving && (
                            <Loader2 className="me-2 h-4 w-4 animate-spin" />
                        )}
                        {t("Save metadata")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
