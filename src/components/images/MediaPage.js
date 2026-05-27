"use client";

import {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
    Download,
    Settings,
    Loader2,
    X,
    Tag,
    Sparkles,
    Music,
    Check,
    Lightbulb,
    BetweenHorizontalStart,
    BetweenHorizontalEnd,
    Image as ImageIcon,
    AlertCircle,
    StepForward,
    ZoomIn,
    ZoomOut,
} from "lucide-react";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { AuthContext } from "../../App";
import { Modal } from "../../../@/components/ui/modal";
import { useApolloClient } from "@apollo/client";
import { QUERIES } from "../../graphql";

import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider,
} from "../../../@/components/ui/tooltip";
import {
    Popover,
    PopoverTrigger,
    PopoverContent,
} from "../../../@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { AutosizeTextarea } from "@/components/ui/autosize-textarea";
import { ImageWithFallback } from "../chat/MediaCard";
import SyncedAudioControl from "./SyncedAudioControl";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogAction,
} from "../../../@/components/ui/alert-dialog";
import { useRunTask } from "../../../app/queries/notifications";
import {
    useMediaItems,
    useCreateMediaItem,
    useDeleteMediaItem,
    useMigrateMediaItems,
    useSyncMediaItemsFromStorage,
    useUpdateMediaItem,
    useUpdateMediaItemTags,
    useAutoTagMediaItem,
    useCleanupOrphanedMediaItems,
} from "../../../app/queries/media-items";

import { useMediaModels } from "../../../app/queries/modelMetadata";
import { useMediaSelection } from "./hooks/useItemSelection";
import { useBulkOperations } from "./hooks/useBulkOperations";
import { useModelSelection } from "./hooks/useModelSelection";
import {
    hasUsableInputAudioUrl,
    MAX_INPUT_IMAGE_REFERENCES,
    useMediaGeneration,
} from "./hooks/useMediaGeneration";
import { useFileUpload } from "./hooks/useFileUpload";
import UnifiedFileManager from "../common/UnifiedFileManager";
import { createFileId } from "../common/fileIdUtils";
import { getDownloadUrl } from "../../utils/fileDownloadUtils";
import {
    checkFileByBlobPath,
    uploadFileToMediaHelper,
} from "../../utils/fileUploadUtils";
import { buildMediaFilename } from "../../utils/mediaFilename";
import { basePath } from "../../utils/constants";
import {
    buildMediaHelperFileParams,
    createMediaStorageTarget,
} from "../../utils/storageTargets";
import {
    sanitizeMediaModelSettings,
    sanitizeMediaSettings,
} from "../../utils/mediaGenerationSettings";
import { getVideoFrameReferenceTarget } from "../../utils/mediaVideoFrameReferences";
import {
    dedupeMediaItemsForDisplay,
    extractMediaBlobPathFromUrl,
    isLikelyRawStorageFileForProcessingMedia,
} from "./mediaItemDeduplication";
import { isProcessingGeneratedMediaItem } from "../../utils/mediaDuplicateSuppression";
import {
    isVideoFrameReferenceRole,
    selectImageReferencesWithinLimits,
} from "./mediaReferenceLimits";
import {
    OpenAIIcon,
    GoogleGeminiIcon,
    AnthropicIcon,
    XAIGrokIcon,
    MoonshotIcon,
} from "../icons/ModelIcons";
import "./Media.scss";

function InlineSettingPicker({
    label,
    value,
    displayValue,
    options,
    onSelect,
    formatOption = (option) => option.label ?? option.value,
}) {
    const [isOpen, setIsOpen] = useState(false);

    if (!options?.length || value === undefined || value === null) {
        return null;
    }

    const isLongOptionList = options.length > 8;
    const handleOptionSelect = (optionValue) => {
        onSelect(optionValue);
        setIsOpen(false);
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="media-setting-chip"
                    aria-label={label}
                    title={label}
                >
                    {displayValue ?? value}
                </button>
            </PopoverTrigger>
            <PopoverContent className="media-setting-popover" align="start">
                <div className="media-setting-popover-title">{label}</div>
                <div
                    className={`media-setting-options ${
                        isLongOptionList ? "scrollable" : ""
                    }`}
                >
                    {options.map((option) => {
                        const optionValue = option.value;
                        const isSelected = optionValue === value;
                        return (
                            <button
                                type="button"
                                key={String(optionValue)}
                                className={`media-setting-option ${
                                    isSelected ? "selected" : ""
                                }`}
                                onMouseDown={(event) => {
                                    if (event.button !== 0) return;
                                    event.preventDefault();
                                    handleOptionSelect(optionValue);
                                }}
                                onClick={() => handleOptionSelect(optionValue)}
                            >
                                <span>{formatOption(option)}</span>
                                {isSelected && (
                                    <Check className="h-3.5 w-3.5" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}

function InlineNumberSetting({ label, value, control, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const normalizedValue = normalizeNumericMediaControlValue(value, control);
    const displayValue = getMediaControlDisplayValue(
        normalizedValue,
        [],
        control,
    );

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="media-setting-chip"
                    aria-label={label}
                    title={label}
                >
                    {displayValue}
                </button>
            </PopoverTrigger>
            <PopoverContent className="media-setting-popover" align="start">
                <div className="media-setting-popover-title">{label}</div>
                <div className="media-setting-number-row">
                    <input
                        type="number"
                        className="media-setting-number-input"
                        min={control.min}
                        max={control.max}
                        step={control.step || 1}
                        value={normalizedValue}
                        onChange={(event) =>
                            onChange(
                                normalizeNumericMediaControlValue(
                                    event.target.value,
                                    control,
                                ),
                            )
                        }
                    />
                    {control.unit && (
                        <span className="media-setting-number-unit">
                            {control.unit}
                        </span>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

function SettingsOptionGroup({
    label,
    value,
    options,
    onSelect,
    formatOption = (option) => option.label ?? option.value,
}) {
    if (!options?.length) return null;
    const handleOptionSelect = (optionValue) => {
        onSelect(optionValue);
    };

    return (
        <div className="media-settings-control">
            <div className="media-settings-control-label">{label}</div>
            <div className="media-settings-options">
                {options.map((option) => {
                    const optionValue = option.value;
                    const isSelected = optionValue === value;
                    return (
                        <button
                            type="button"
                            key={String(optionValue)}
                            className={`media-settings-option ${
                                isSelected ? "selected" : ""
                            }`}
                            onMouseDown={(event) => {
                                if (event.button !== 0) return;
                                event.preventDefault();
                                handleOptionSelect(optionValue);
                            }}
                            onClick={() => handleOptionSelect(optionValue)}
                        >
                            <span>{formatOption(option)}</span>
                            {isSelected && <Check className="h-3.5 w-3.5" />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function TextMediaControl({
    label,
    value,
    placeholder = "",
    minHeight = 42,
    maxHeight = 180,
    onChange,
}) {
    return (
        <div className="media-text-control">
            <label className="media-text-control-label">{label}</label>
            <AutosizeTextarea
                className="media-text-control-input"
                maxHeight={maxHeight}
                minHeight={minHeight}
                placeholder={placeholder}
                value={value || ""}
                onChange={(event) => onChange(event.target.value)}
            />
        </div>
    );
}

function NumericSettingsControl({ label, value, control, onChange }) {
    const normalizedValue = normalizeNumericMediaControlValue(value, control);

    return (
        <div className="media-settings-control">
            <div className="media-settings-control-label">{label}</div>
            <div className="media-settings-number-row">
                <input
                    type="number"
                    className="media-settings-number-input"
                    min={control.min}
                    max={control.max}
                    step={control.step || 1}
                    value={normalizedValue}
                    onChange={(event) =>
                        onChange(
                            normalizeNumericMediaControlValue(
                                event.target.value,
                                control,
                            ),
                        )
                    }
                />
                {control.unit && (
                    <span className="media-settings-number-unit">
                        {control.unit}
                    </span>
                )}
            </div>
        </div>
    );
}

const getModelProviderInfo = (modelMeta, modelName, displayName) => {
    const text = [
        modelMeta?.provider,
        modelMeta?.modelId,
        modelName,
        displayName,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    if (text.includes("gemini") || text.includes("lyria")) {
        return { key: "gemini", label: "Gemini" };
    }
    if (text.includes("gpt") || text.includes("openai")) {
        return { key: "openai", label: "OpenAI" };
    }
    if (text.includes("grok") || text.includes("xai")) {
        return { key: "xai", label: "xAI" };
    }
    if (text.includes("claude") || text.includes("anthropic")) {
        return { key: "anthropic", label: "Anthropic" };
    }
    if (text.includes("moonshot")) {
        return { key: "moonshot", label: "Moonshot" };
    }
    if (text.includes("seedream") || text.includes("bytedance")) {
        return { key: "bytedance", label: "Seedream" };
    }
    if (text.includes("veo")) {
        return { key: "veo", label: "Veo" };
    }
    if (text.includes("kling")) {
        return { key: "kling", label: "Kling" };
    }
    if (text.includes("seedance")) {
        return { key: "seedance", label: "Seedance" };
    }
    if (text.includes("flux")) {
        return { key: "flux", label: "Flux" };
    }
    if (text.includes("elevenlabs") || text.includes("eleven labs")) {
        return { key: "elevenlabs", label: "ElevenLabs" };
    }
    if (text.includes("minimax") || text.includes("mini max")) {
        return { key: "minimax", label: "MiniMax" };
    }
    if (text.includes("replicate")) {
        return { key: "replicate", label: "Replicate" };
    }

    const provider = modelMeta?.provider || "model";
    return {
        key: "default",
        label: provider,
    };
};

function MediaModelAssetIcon({ fileName, label }) {
    return (
        <img
            src={`${basePath || ""}/assets/${fileName}`}
            alt={label}
            className="media-model-provider-img"
            loading="eager"
            decoding="sync"
        />
    );
}

function MediaModelProviderIcon({ providerInfo }) {
    const className = "media-model-provider-img";

    switch (providerInfo.key) {
        case "gemini":
            return <GoogleGeminiIcon className={className} />;
        case "openai":
            return <OpenAIIcon className={className} />;
        case "xai":
            return <XAIGrokIcon className={className} />;
        case "anthropic":
            return <AnthropicIcon className={className} />;
        case "moonshot":
            return <MoonshotIcon className={className} />;
        case "bytedance":
        case "seedance":
            return (
                <MediaModelAssetIcon
                    fileName="bytedance-color.svg"
                    label={providerInfo.label}
                />
            );
        case "kling":
            return (
                <MediaModelAssetIcon
                    fileName="kling-color.svg"
                    label={providerInfo.label}
                />
            );
        case "flux":
            return (
                <MediaModelAssetIcon
                    fileName="flux.svg"
                    label={providerInfo.label}
                />
            );
        case "replicate":
            return (
                <MediaModelAssetIcon
                    fileName="replicate.svg"
                    label={providerInfo.label}
                />
            );
        case "elevenlabs":
            return (
                <span
                    className="media-model-provider-badge media-model-provider-badge-elevenlabs"
                    data-badge="11"
                    aria-hidden="true"
                />
            );
        case "minimax":
            return (
                <span
                    className="media-model-provider-badge media-model-provider-badge-minimax"
                    data-badge="MM"
                    aria-hidden="true"
                />
            );
        case "veo":
            return <GoogleGeminiIcon className={className} />;
        default:
            return (
                <span
                    className={`media-model-provider-dot media-model-provider-${providerInfo.key}`}
                    aria-hidden="true"
                />
            );
    }
}

const MEDIA_PROVIDER_ICON_FILES = [
    "google-icon.svg",
    "openai-dark.svg",
    "openai-light.svg",
    "claude-icon.svg",
    "grok-dark.svg",
    "grok-light.svg",
    "moonshot-dark.svg",
    "moonshot-light.svg",
    "bytedance-color.svg",
    "kling-color.svg",
    "flux.svg",
    "replicate.svg",
];

function MediaModelSelectContent({
    direction,
    modelGroups,
    getDisplayName,
    getModelMeta,
    onModelSelect,
    onClose,
    emptyLabel = "No models",
}) {
    const { t } = useTranslation();

    return (
        <SelectContent
            dir={direction}
            className="media-model-select-content"
            align="start"
        >
            <button
                type="button"
                className="media-model-select-close"
                aria-label={t("Close model selector")}
                onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                }}
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onClose?.();
                }}
            >
                <X className="h-3.5 w-3.5" />
            </button>
            <div className="media-model-select-columns">
                {modelGroups.map(({ key, title, symbol, models }) => (
                    <SelectGroup
                        key={key}
                        className={`media-model-select-column media-model-select-column-${key}`}
                    >
                        <SelectLabel className="media-model-select-label">
                            <span className="media-model-select-label-main">
                                <span
                                    className={`media-model-select-label-icon media-model-select-label-icon-${key}`}
                                >
                                    {symbol}
                                </span>
                                <span>{title}</span>
                            </span>
                            <span className="media-model-select-count">
                                {models.length}
                            </span>
                        </SelectLabel>
                        {models.length > 0 ? (
                            models.map((modelName) => {
                                const displayName = getDisplayName(modelName);
                                const providerInfo = getModelProviderInfo(
                                    getModelMeta(modelName),
                                    modelName,
                                    displayName,
                                );
                                return (
                                    <SelectItem
                                        key={modelName}
                                        value={modelName}
                                        className="media-model-select-item"
                                        onClick={() =>
                                            onModelSelect?.(modelName)
                                        }
                                    >
                                        <div className="media-model-select-row">
                                            <span
                                                className="media-model-provider-icon"
                                                title={providerInfo.label}
                                                aria-label={providerInfo.label}
                                            >
                                                <MediaModelProviderIcon
                                                    providerInfo={providerInfo}
                                                />
                                            </span>
                                            <span className="media-model-select-copy">
                                                <span className="media-model-select-name">
                                                    {displayName}
                                                </span>
                                            </span>
                                        </div>
                                    </SelectItem>
                                );
                            })
                        ) : (
                            <div className="media-model-select-empty">
                                {emptyLabel}
                            </div>
                        )}
                    </SelectGroup>
                ))}
            </div>
        </SelectContent>
    );
}

// Build default settings from API media models
const buildDefaultSettings = (mediaModels) => {
    if (!mediaModels?.length) return {};
    const models = {};
    for (const m of mediaModels) {
        models[m.modelId] = { type: m.category, ...m.mediaDefaults };
    }
    return models;
};

const MEDIA_STORAGE_SYNC_INTERVAL_MS = 60 * 1000;
const MEDIA_STORAGE_SYNC_THROTTLE_MS = 15 * 1000;

// Merge user settings with API model list — add missing models, remove deprecated ones
const mergeWithApiModels = (existingSettings, mediaModels) => {
    if (!mediaModels?.length) return sanitizeMediaSettings(existingSettings);
    const apiDefaults = buildDefaultSettings(mediaModels);
    const apiIds = new Set(mediaModels.map((m) => m.modelId));
    const mergedModels = { ...apiDefaults };
    if (existingSettings?.models) {
        for (const [id, s] of Object.entries(existingSettings.models)) {
            if (apiIds.has(id)) {
                mergedModels[id] = {
                    ...(apiDefaults[id] || {}),
                    ...s,
                };
            }
        }
    }
    return sanitizeMediaSettings({
        ...(existingSettings || {}),
        models: mergedModels,
    });
};

// Get settings for a specific model — user overrides > API defaults
const getModelSettings = (settings, modelName, mediaModels) => {
    const apiModel = mediaModels?.find((m) => m.modelId === modelName);
    const apiDefaults = apiModel
        ? { type: apiModel.category, ...apiModel.mediaDefaults }
        : null;
    if (settings?.models?.[modelName]) {
        return sanitizeMediaModelSettings(
            { ...(apiDefaults || {}), ...settings.models[modelName] },
            modelName,
        );
    }
    if (apiDefaults) return apiDefaults;
    return { type: "image", quality: "high", aspectRatio: "1:1" };
};

// Get model type from settings or API
const getModelType = (modelName, settings, mediaModels) => {
    if (settings?.models?.[modelName]?.type)
        return settings.models[modelName].type;
    const apiModel = mediaModels?.find((m) => m.modelId === modelName);
    return apiModel?.category || "image";
};

const getMediaTypeIcon = (type) => {
    if (type === "video") return "🎬";
    if (type === "audio") return "🎵";
    if (type === "tts") return "🗣️";
    return "🖼️";
};

const getGenerationOutputType = (type) => (type === "tts" ? "audio" : type);

const VIDEO_EXTEND_REFERENCE_ROLE = "extend";
const DEDICATED_MEDIA_TOGGLE_CONTROLS = new Set([
    "generateAudio",
    "cameraFixed",
    "optimizePrompt",
]);

function getMediaControlOptions(control, t) {
    if (!control?.key) return [];
    if (control.type === "boolean") {
        return [
            {
                value: true,
                label: t(control.trueLabel || "Enabled"),
            },
            {
                value: false,
                label: t(control.falseLabel || "Disabled"),
            },
        ];
    }
    if (control.type === "select" && Array.isArray(control.options)) {
        return control.options.map((option) => ({
            value: option.value,
            label: t(option.label ?? String(option.value)),
        }));
    }
    return [];
}

function isNumericMediaControl(control) {
    return control?.type === "integer" || control?.type === "number";
}

function isTextMediaControl(control) {
    return control?.type === "text" || control?.type === "textarea";
}

function matchesMediaControlCondition(
    condition,
    modelMeta,
    modelSettings = {},
) {
    if (!condition || typeof condition !== "object") return true;

    return Object.entries(condition).every(([key, expected]) => {
        const value = modelSettings[key] ?? modelMeta?.mediaDefaults?.[key];
        return Array.isArray(expected)
            ? expected.includes(value)
            : value === expected;
    });
}

function isMediaControlVisible(control, modelMeta, modelSettings = {}) {
    if (
        !matchesMediaControlCondition(
            control?.showWhen,
            modelMeta,
            modelSettings,
        )
    ) {
        return false;
    }
    if (!control?.hideWhen) return true;
    return !matchesMediaControlCondition(
        control.hideWhen,
        modelMeta,
        modelSettings,
    );
}

function getModelSettingValue(modelSettings, modelMeta, keys) {
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const key of keyList) {
        if (modelSettings?.[key] !== undefined) {
            return modelSettings[key];
        }
    }
    for (const key of keyList) {
        if (modelMeta?.mediaDefaults?.[key] !== undefined) {
            return modelMeta.mediaDefaults[key];
        }
    }
    return undefined;
}

function isVoiceDesignMode(modelSettings, modelMeta) {
    return (
        getModelSettingValue(modelSettings, modelMeta, [
            "mode",
            "voiceMode",
            "voice_mode",
        ]) === "voice_design"
    );
}

function getVoiceDescriptionValue(modelSettings, modelMeta) {
    return getModelSettingValue(modelSettings, modelMeta, [
        "voiceDescription",
        "voice_description",
    ]);
}

function normalizeNumericMediaControlValue(value, control) {
    const fallback =
        control?.defaultValue ??
        control?.min ??
        (control?.type === "number" ? 0 : 1);
    let nextValue = Number(value);
    if (!Number.isFinite(nextValue)) nextValue = fallback;
    if (Number.isFinite(control?.min)) {
        nextValue = Math.max(Number(control.min), nextValue);
    }
    if (Number.isFinite(control?.max)) {
        nextValue = Math.min(Number(control.max), nextValue);
    }
    if (control?.type === "integer") {
        nextValue = Math.round(nextValue);
    }
    return nextValue;
}

function getMediaControlDisplayValue(value, options, control) {
    if (isNumericMediaControl(control)) {
        const normalizedValue = normalizeNumericMediaControlValue(
            value,
            control,
        );
        return `${normalizedValue}${control?.unit || ""}`;
    }
    const selected = options.find((option) => option.value === value);
    return selected?.label ?? value;
}

function getMediaToggleLabel(toggleKey) {
    if (toggleKey === "forceInstrumental") {
        return {
            label: "Instrumental",
            trueLabel: "Instrumental",
            falseLabel: "Vocals allowed",
        };
    }
    return {
        label: toggleKey,
        trueLabel: "Enabled",
        falseLabel: "Disabled",
    };
}

function getAugmentedMediaControls(modelMeta, t, modelSettings = {}) {
    const controls = Array.isArray(modelMeta?.mediaControls)
        ? modelMeta.mediaControls.map((control) => ({ ...control }))
        : [];
    const keys = new Set(controls.map((control) => control.key));

    if (
        Array.isArray(modelMeta?.availableOutputFormats) &&
        modelMeta.availableOutputFormats.length > 0 &&
        !keys.has("outputFormat")
    ) {
        controls.push({
            key: "outputFormat",
            label: "Output Format",
            type: "select",
            options: modelMeta.availableOutputFormats,
        });
        keys.add("outputFormat");
    }

    for (const toggleKey of modelMeta?.mediaToggles || []) {
        if (DEDICATED_MEDIA_TOGGLE_CONTROLS.has(toggleKey)) continue;
        if (keys.has(toggleKey)) continue;
        const labels = getMediaToggleLabel(toggleKey);
        controls.push({
            key: toggleKey,
            label: labels.label,
            type: "boolean",
            trueLabel: labels.trueLabel,
            falseLabel: labels.falseLabel,
        });
        keys.add(toggleKey);
    }

    return controls
        .filter((control) =>
            isMediaControlVisible(control, modelMeta, modelSettings),
        )
        .map((control) => ({
            ...control,
            options: getMediaControlOptions(control, t),
        }))
        .filter(
            (control) =>
                control.key &&
                (isNumericMediaControl(control) ||
                    isTextMediaControl(control) ||
                    control.options.length > 0),
        );
}

const VIDEO_LAST_FRAME_OFFSET_SECONDS = 0.05;
const MAX_VIDEO_THUMBNAIL_BACKFILLS_PER_BATCH = 3;

function getMediaMimeType(type, url = "") {
    const extension = getImageFormatFromUrl(url);
    if (type === "image") return extension ? `image/${extension}` : "image/*";
    if (type === "video") return extension ? `video/${extension}` : "video/*";
    if (type === "audio") return extension ? `audio/${extension}` : "audio/*";
    return undefined;
}

function getMediaThumbnailUrl(media) {
    return (
        media?.thumbnailAzureUrl ||
        media?.thumbnailUrl ||
        media?.posterUrl ||
        media?.thumbnailGcsUrl ||
        null
    );
}

function extractBlobPathFromStorageUrl(url) {
    return extractMediaBlobPathFromUrl(url);
}

function getMediaBlobPath(media) {
    return (
        media?.blobPath ||
        extractBlobPathFromStorageUrl(media?.azureUrl || media?.url) ||
        null
    );
}

function needsVideoThumbnailBackfill(media) {
    return (
        media?.type === "video" &&
        media?.status === "completed" &&
        !getMediaThumbnailUrl(media) &&
        Boolean(media?.azureUrl || media?.url)
    );
}

function isMediaSupportAsset(media) {
    const blobPath = String(media?.blobPath || media?.name || "").replace(
        /\\/g,
        "/",
    );
    const filename = String(
        media?.filename ||
            media?.displayFilename ||
            (blobPath ? blobPath.split("/").pop() : "") ||
            "",
    );

    return (
        blobPath.includes("video-thumbnails/") ||
        blobPath.includes("video-frame-references/") ||
        /^thumbnail-[^.].*\.jpe?g$/i.test(filename) ||
        /^(start_frame|end_frame)-.*\.jpe?g$/i.test(filename)
    );
}

function isVisibleMediaExplorerFile(file) {
    return !isMediaSupportAsset(file?._mediaItem || file);
}

function getMediaDisplayFilename(media) {
    const url =
        media?.blobPath || media?.azureUrl || media?.url || media?.gcsUrl || "";
    const fromUrl = getSelectedMediaDisplayName({
        url,
        azureUrl: media?.azureUrl,
        gcsUrl: media?.gcsUrl,
    });
    if (fromUrl) return fromUrl;
    const promptName = String(media?.prompt || "media")
        .trim()
        .toLowerCase()
        .replace(/[_\s]+/g, "-")
        .replace(/[^a-z0-9.-]+/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);
    return promptName || "media";
}

function getSyntheticMediaPath(media) {
    const id =
        media?.taskId ||
        media?.cortexRequestId ||
        media?._id ||
        Date.now().toString(36);
    return [media?.outputFolder, `${id}-${getMediaDisplayFilename(media)}`]
        .filter(Boolean)
        .join("/");
}

function mediaItemToUnifiedFile(media) {
    const url = media?.azureUrl || media?.url || "";
    const filename = getMediaDisplayFilename(media);
    const blobPath = getMediaBlobPath(media);
    const name = blobPath || getSyntheticMediaPath(media);
    const timestamp = media?.completed || media?.created;
    const isoTimestamp = timestamp
        ? new Date(timestamp * 1000).toISOString()
        : undefined;

    return {
        ...media,
        _mediaItem: media,
        id: media?._id || media?.taskId || media?.cortexRequestId,
        name,
        filename,
        displayFilename: filename,
        originalName: filename,
        url,
        azureUrl: media?.azureUrl || media?.url,
        gcsUrl: media?.gcsUrl,
        thumbnailUrl: media?.thumbnailUrl || media?.thumbnailAzureUrl,
        thumbnailAzureUrl: media?.thumbnailAzureUrl || media?.thumbnailUrl,
        thumbnailGcsUrl: media?.thumbnailGcsUrl,
        thumbnailBlobPath: media?.thumbnailBlobPath || null,
        thumbnailHash: media?.thumbnailHash,
        blobPath,
        outputFolder: media?.outputFolder || "",
        hash: media?.hash,
        mimeType: getMediaMimeType(media?.type, url || filename),
        lastModified: isoTimestamp,
        lastAccessed: isoTimestamp,
    };
}

function normalizeMediaFolderPath(value) {
    return String(value || "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "")
        .replace(/\/+/g, "/");
}

function getMoveFilename(file) {
    const source =
        file?.filename ||
        file?.displayFilename ||
        file?.displayName ||
        file?.blobPath ||
        file?.name ||
        "";
    return String(source).split("/").filter(Boolean).pop() || "";
}

function getMovedMediaBlobPath({ targetFolder, filename }) {
    const normalizedTarget = normalizeMediaFolderPath(targetFolder);
    const relativePath = normalizedTarget
        ? `${normalizedTarget}/${filename}`
        : filename;
    return `media/${relativePath}`;
}

function getRenamedMediaBlobPath({ blobPath, filename }) {
    const normalizedBlobPath = normalizeMediaFolderPath(blobPath);
    if (!normalizedBlobPath) return "";

    const pathSegments = normalizedBlobPath.split("/").filter(Boolean);
    pathSegments[pathSegments.length - 1] = filename;
    return pathSegments.join("/");
}

function getMoveResultPayload(data) {
    const result = data?.result || data || {};
    return {
        url: result.url || result.azureUrl || result.gcs || null,
        azureUrl: result.azureUrl || result.url || null,
        gcsUrl: result.gcsUrl || result.gcs || null,
        blobPath: result.blobPath || result.name || null,
        hash: result.hash || null,
    };
}

function getVideoFrameReferenceTime(video, role) {
    if (role !== "start_frame") return 0;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    return Math.max(duration - VIDEO_LAST_FRAME_OFFSET_SECONDS, 0);
}

function captureVideoFrameBlobFromSource(videoUrl, role) {
    if (typeof document === "undefined") {
        return Promise.reject(
            new Error("Video frame extraction requires a browser"),
        );
    }

    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        const cleanupHandlers = [];
        let settled = false;

        const cleanup = () => {
            cleanupHandlers.forEach((cleanupHandler) => cleanupHandler());
            video.removeAttribute("src");
            video.load();
        };
        const settle = (callback, value) => {
            if (settled) return;
            settled = true;
            cleanup();
            callback(value);
        };
        const on = (eventName, handler, options) => {
            video.addEventListener(eventName, handler, options);
            cleanupHandlers.push(() =>
                video.removeEventListener(eventName, handler, options),
            );
        };
        const drawFrame = () => {
            const width = video.videoWidth || 1;
            const height = video.videoHeight || 1;
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            if (!context) {
                settle(reject, new Error("Could not read video frame"));
                return;
            }
            try {
                context.drawImage(video, 0, 0, width, height);
            } catch (error) {
                settle(reject, error);
                return;
            }

            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        settle(
                            reject,
                            new Error("Could not encode video frame"),
                        );
                        return;
                    }
                    settle(resolve, blob);
                },
                "image/jpeg",
                0.92,
            );
        };
        const seekToReferenceFrame = () => {
            const frameTime = getVideoFrameReferenceTime(video, role);
            if (frameTime <= 0.001) {
                drawFrame();
                return;
            }
            video.currentTime = frameTime;
        };

        on("loadeddata", seekToReferenceFrame, { once: true });
        on("seeked", drawFrame);
        on("error", () =>
            settle(reject, new Error("Could not load video reference")),
        );

        const timeoutId = window.setTimeout(
            () =>
                settle(
                    reject,
                    new Error("Timed out extracting video reference frame"),
                ),
            15000,
        );
        cleanupHandlers.push(() => window.clearTimeout(timeoutId));

        video.crossOrigin = "anonymous";
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.src = videoUrl;
        video.load();
    });
}

async function captureVideoFrameBlob(videoUrl, role) {
    try {
        return await captureVideoFrameBlobFromSource(videoUrl, role);
    } catch (directError) {
        const response = await fetch(videoUrl);
        if (!response.ok) throw directError;

        const videoBlob = await response.blob();
        const objectUrl = URL.createObjectURL(videoBlob);
        try {
            return await captureVideoFrameBlobFromSource(objectUrl, role);
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }
}

const getInputImageReferences = (media) => {
    if (!media) return [];

    return Array.from({ length: MAX_INPUT_IMAGE_REFERENCES }, (_, index) => {
        const fieldName =
            index === 0 ? "inputImageUrl" : `inputImageUrl${index + 1}`;
        const roleFieldName =
            index === 0 ? "inputImageRole" : `inputImageRole${index + 1}`;
        return {
            url: media[fieldName],
            role: media[roleFieldName],
        };
    })
        .filter((reference) => reference.url)
        .filter(
            (reference, index, references) =>
                references.findIndex((item) => item.url === reference.url) ===
                index,
        )
        .map((reference, index) => ({
            id: `${index}-${reference.url}`,
            url: reference.url,
            role: reference.role,
            displayUrl: /^https?:\/\//i.test(reference.url)
                ? getDownloadUrl(reference.url)
                : null,
        }));
};

const REFERENCE_IMAGE_ROLE_LABELS = {
    start_frame: "Start Frame",
    end_frame: "End Frame",
    reference: "Reference",
    extend: "Extend",
};

const REFERENCE_IMAGE_ROLE_ICONS = {
    start_frame: BetweenHorizontalStart,
    end_frame: BetweenHorizontalEnd,
    reference: ImageIcon,
    extend: StepForward,
};

const getReferenceImageRoleLabel = (role, t) =>
    t(REFERENCE_IMAGE_ROLE_LABELS[role] || role || "Reference");

function ReferenceImageRoleBadge({ role, label, className = "" }) {
    const Icon = REFERENCE_IMAGE_ROLE_ICONS[role] || Tag;

    return (
        <span
            className={`media-reference-role-badge ${className}`.trim()}
            title={label}
            aria-label={label}
        >
            <Icon aria-hidden="true" focusable="false" />
        </span>
    );
}

function SelectedReferenceThumbnail({ media, className = "" }) {
    const mediaUrl = getSelectedMediaUrl(media);
    const displayUrl = /^https?:\/\//i.test(mediaUrl)
        ? getDownloadUrl(mediaUrl)
        : mediaUrl;

    if (media?.type === "audio") {
        return (
            <span
                className={`media-selected-reference-audio ${className}`.trim()}
            >
                <Music aria-hidden="true" focusable="false" />
            </span>
        );
    }

    if (media?.type === "video") {
        return (
            <video
                src={displayUrl}
                className={className}
                preload="metadata"
                muted
                playsInline
            />
        );
    }

    return (
        <ImageWithFallback
            src={displayUrl}
            alt={media?.prompt || ""}
            className={className}
        />
    );
}

const getSelectedMediaId = (image) =>
    image?.cortexRequestId ||
    image?.taskId ||
    image?._id ||
    image?.url ||
    image?.azureUrl ||
    image?.gcsUrl;

const getSelectedMediaTaskId = (image) =>
    image?.taskId || image?.cortexRequestId || image?._id;

const getSelectedMediaUrl = (image) =>
    image?.azureUrl || image?.gcsUrl || image?.url || "";

const isFailedMediaFile = (file) => {
    const media = file?._mediaItem || file;
    return ["failed", "error"].includes(
        String(media?.status || "").toLowerCase(),
    );
};

const getImageFormatFromUrl = (url) => {
    if (typeof url !== "string" || !url.trim()) return "";

    const dataUriMatch = url.match(/^data:image\/([^;,]+)/i);
    if (dataUriMatch) return dataUriMatch[1].toLowerCase();

    const getExtensionFromPath = (value) => {
        const path = value.split("?")[0].split("#")[0];
        const filename = path.split("/").pop() || "";
        if (!filename.includes(".")) return "";
        return filename.split(".").pop().toLowerCase();
    };

    try {
        const parsedUrl = new URL(url);
        return getExtensionFromPath(parsedUrl.pathname);
    } catch {
        return getExtensionFromPath(url);
    }
};

const isUnsupportedVeoInputImage = (image) => {
    if (image?.type !== "image") return false;
    const format = getImageFormatFromUrl(getSelectedMediaUrl(image));
    return Boolean(format) && !["jpg", "jpeg", "png"].includes(format);
};

const getSelectedMediaDisplayName = (image) => {
    const explicitName =
        image?.displayFilename || image?.displayName || image?.filename;
    if (explicitName) return explicitName;

    const url = getSelectedMediaUrl(image);
    try {
        const parsedUrl = new URL(url);
        return decodeURIComponent(parsedUrl.pathname.split("/").pop() || "");
    } catch {
        return decodeURIComponent(
            url.split("?")[0].split("#")[0].split("/").pop() || "",
        );
    }
};

const getDefaultReferenceImageRole = (
    supportedRoles = [],
    { preferExtend = false } = {},
) => {
    if (!supportedRoles.length) return "";
    if (preferExtend && supportedRoles.includes(VIDEO_EXTEND_REFERENCE_ROLE)) {
        return VIDEO_EXTEND_REFERENCE_ROLE;
    }
    if (supportedRoles.includes("reference")) {
        return "reference";
    }
    return supportedRoles[0] || "";
};

const getMaxVideoInputCount = (modelMeta) => {
    const inputVideos = modelMeta?.mediaDefaults?.inputVideos;
    if (Array.isArray(inputVideos)) {
        return Number(inputVideos[1] ?? inputVideos[0] ?? 0) || 0;
    }
    return Number(inputVideos) || 0;
};

const getReferenceRange = (range, fallbackMax = 0) => {
    if (Array.isArray(range)) {
        const min = Number(range[0] ?? 0) || 0;
        const max = Number(range[1] ?? range[0] ?? fallbackMax);
        return {
            min,
            max: Number.isFinite(max) ? max : fallbackMax,
        };
    }

    if (range === undefined || range === null) {
        return { min: 0, max: fallbackMax };
    }

    const value = Number(range);
    return {
        min: value > 0 ? value : 0,
        max: Number.isFinite(value) ? value : fallbackMax,
    };
};

const getEffectiveMediaDefaults = (modelMeta, modelSettings = {}) => {
    const defaults = { ...(modelMeta?.mediaDefaults || {}) };
    const overrides = Array.isArray(modelMeta?.mediaDefaultOverrides)
        ? modelMeta.mediaDefaultOverrides
        : [];

    return overrides.reduce((resolvedDefaults, override) => {
        const conditions = override?.when || {};
        const matches = Object.entries(conditions).every(([key, expected]) => {
            const value =
                modelSettings[key] ??
                resolvedDefaults[key] ??
                modelMeta?.mediaDefaults?.[key];
            return Array.isArray(expected)
                ? expected.includes(value)
                : value === expected;
        });

        return matches
            ? { ...resolvedDefaults, ...(override.mediaDefaults || {}) }
            : resolvedDefaults;
    }, defaults);
};

const getModelInputAudioRange = (modelMeta, modelSettings = {}) => {
    const effectiveDefaults = getEffectiveMediaDefaults(
        modelMeta,
        modelSettings,
    );
    const range = effectiveDefaults.inputAudio ?? modelSettings.inputAudio;
    if (range === undefined || range === null) return null;
    return getReferenceRange(range, 1);
};

const getModelInputImagesRange = (modelMeta, modelSettings = {}) =>
    getReferenceRange(
        getEffectiveMediaDefaults(modelMeta, modelSettings).inputImages ??
            modelSettings.inputImages,
        3,
    );

const getModelInputVideosRange = (modelMeta, modelSettings = {}) =>
    getReferenceRange(
        getEffectiveMediaDefaults(modelMeta, modelSettings).inputVideos ??
            modelSettings.inputVideos,
        0,
    );

function getAudioTime(audio, key) {
    return Number.isFinite(audio?.[key]) ? audio[key] : 0;
}

// Migrate legacy flat settings to per-model format
const migrateSettings = (oldSettings) => {
    if (oldSettings.models) return oldSettings;
    return {
        models: {},
        image: oldSettings.image || {
            defaultQuality: "high",
            defaultModel: "gemini-31-flash-image-preview",
            defaultAspectRatio: "1:1",
        },
        video: oldSettings.video || {
            defaultModel: "replicate-seedance-1-pro",
            defaultAspectRatio: "16:9",
            defaultDuration: 5,
            defaultGenerateAudio: false,
            defaultResolution: "1080p",
            defaultCameraFixed: false,
        },
        audio: oldSettings.audio || {
            defaultModel: "google-lyria-3-music",
        },
    };
};

function MediaPage() {
    const { direction } = useContext(LanguageContext);
    const { user, userState, debouncedUpdateUserState } =
        useContext(AuthContext);
    const { data: mediaModels } = useMediaModels();
    const [prompt, setPrompt] = useState("");
    const [, setQuality] = useState("draft");
    const [, setOutputType] = useState("image");
    const [selectedModel, setSelectedModel] = useState(""); // Set from API defaults on load
    const [isModelSelectOpen, setIsModelSelectOpen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [disableTooltip, setDisableTooltip] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [lyricsByModel, setLyricsByModel] = useState({});
    const [inputImageRolesById, setInputImageRolesById] = useState({});
    const [currentMediaFolder, setCurrentMediaFolder] = useState("");
    const runTask = useRunTask();
    const client = useApolloClient();

    useEffect(() => {
        if (typeof window === "undefined") return;
        MEDIA_PROVIDER_ICON_FILES.forEach((fileName) => {
            const image = new window.Image();
            image.src = `${basePath || ""}/assets/${fileName}`;
        });
    }, []);

    // Disable tooltip when settings dialog is open or just closed
    useEffect(() => {
        if (showSettings) {
            setDisableTooltip(true);
        } else {
            // Keep disabled briefly after closing to prevent reappearance
            const timer = setTimeout(() => {
                setDisableTooltip(false);
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [showSettings]);
    const [settings, setSettings] = useState({ models: {} });
    const settingsRef = useRef(settings);
    const hasLocalMediaSettingsChangesRef = useRef(false);
    const setSettingsAndRef = useCallback((nextSettings) => {
        const resolvedSettings =
            typeof nextSettings === "function"
                ? nextSettings(settingsRef.current)
                : nextSettings;
        settingsRef.current = resolvedSettings;
        setSettings(resolvedSettings);
    }, []);

    // Infinite scroll for media items API
    const { data: mediaItemsData, isLoading: mediaItemsLoading } =
        useMediaItems(1, 1000);

    // Flatten media items into a single array, deduplicating by task/content IDs.
    const images = useMemo(() => {
        const allItems = mediaItemsData?.mediaItems || [];
        return dedupeMediaItemsForDisplay(allItems, {
            isSupportAsset: isMediaSupportAsset,
        });
    }, [mediaItemsData?.mediaItems]);

    // Memoize sorted images by creation date (newest first) - only if we have data
    const sortedImages = useMemo(() => {
        if (images && images.length > 0) {
            return [...images].sort((a, b) => b.created - a.created);
        }
        return [];
    }, [images]);
    const mediaFileItems = useMemo(
        () => sortedImages.map(mediaItemToUnifiedFile),
        [sortedImages],
    );
    const processingGeneratedMediaItems = useMemo(
        () => images.filter(isProcessingGeneratedMediaItem),
        [images],
    );
    const filterMediaExplorerFile = useCallback(
        (file) =>
            isVisibleMediaExplorerFile(file) &&
            !isLikelyRawStorageFileForProcessingMedia(
                file,
                processingGeneratedMediaItems,
            ),
        [processingGeneratedMediaItems],
    );

    const [audioPlayback, setAudioPlayback] = useState({});
    const audioPlaybackRef = useRef({});
    const { t } = useTranslation();
    const modelMap = useMemo(() => {
        if (!mediaModels) return new Map();
        return new Map(mediaModels.map((model) => [model.modelId, model]));
    }, [mediaModels]);
    const mediaStorageTarget = useMemo(
        () => createMediaStorageTarget(user?.contextId),
        [user?.contextId],
    );

    const getMediaPlaybackId = useCallback((image) => {
        return (
            image?.cortexRequestId ||
            image?.taskId ||
            image?.azureUrl ||
            image?.url
        );
    }, []);

    const handleAudioPlaybackChange = useCallback((mediaId, patch, options) => {
        if (!mediaId) return;
        const nextPlayback = {
            ...(audioPlaybackRef.current[mediaId] || {}),
            ...patch,
            updatedAt: Date.now(),
        };
        audioPlaybackRef.current = {
            ...audioPlaybackRef.current,
            [mediaId]: nextPlayback,
        };

        if (options?.silent) return;

        setAudioPlayback((prev) => ({
            ...prev,
            [mediaId]: nextPlayback,
        }));
    }, []);

    const activateAudioSurface = useCallback(
        (image, surface) => {
            const mediaId = getMediaPlaybackId(image);
            if (!mediaId) return;
            setAudioPlayback((prev) => {
                const current = audioPlaybackRef.current[mediaId] || {};
                const nextPlayback = {
                    ...current,
                    activeSurface: surface,
                    updatedAt: Date.now(),
                };
                const next = {
                    ...prev,
                    [mediaId]: nextPlayback,
                };
                audioPlaybackRef.current = next;
                return next;
            });
        },
        [getMediaPlaybackId],
    );

    // API-backed lookup functions
    const getAvailableAspectRatios = useCallback(
        (modelName) => {
            const apiModel = modelMap.get(modelName);
            if (apiModel?.availableAspectRatios) {
                return apiModel.availableAspectRatios.map((v) => ({
                    value: v,
                    label:
                        v === "match_input_image" ? t("Match Input Image") : v,
                }));
            }
            return [];
        },
        [modelMap, t],
    );
    const getAvailableDurations = useCallback(
        (modelName) => {
            const apiModel = modelMap.get(modelName);
            if (apiModel?.availableDurations) {
                return apiModel.availableDurations.map((v) => ({
                    value: v,
                    label: `${v}s`,
                }));
            }
            return [];
        },
        [modelMap],
    );
    const getDisplayName = useCallback(
        (modelName) => {
            const apiModel = modelMap.get(modelName);
            return t(apiModel?.displayName || modelName);
        },
        [modelMap, t],
    );

    const [loading, setLoading] = useState(false);
    const [isMigrationInProgress, setIsMigrationInProgress] = useState(false);
    const [showDownloadError, setShowDownloadError] = useState(false);
    const [downloadError, setDownloadError] = useState("");
    const [showBulkTagDialog, setShowBulkTagDialog] = useState(false);
    const [bulkTagInput, setBulkTagInput] = useState("");
    const [bulkTagMode, setBulkTagMode] = useState("manual");
    const promptRef = useRef(null);
    const formRef = useRef(null);
    const bulkTagInputRef = useRef(null);
    const mediaUploadInputRef = useRef(null);
    const createMediaItem = useCreateMediaItem();
    const deleteMediaItem = useDeleteMediaItem();
    const updateMediaItem = useUpdateMediaItem();
    const migrateMediaItems = useMigrateMediaItems();
    const syncMediaItemsFromStorage = useSyncMediaItemsFromStorage();
    const {
        mutateAsync: syncMediaItemsFromStorageAsync,
        isPending: isSyncingMediaItemsFromStorage,
    } = syncMediaItemsFromStorage;
    const updateTagsMutation = useUpdateMediaItemTags();
    const autoTagMutation = useAutoTagMediaItem();
    const cleanupOrphanedMediaItems = useCleanupOrphanedMediaItems();
    const {
        mutateAsync: cleanupOrphanedMediaItemsAsync,
        isPending: isCleaningOrphanedMediaItems,
    } = cleanupOrphanedMediaItems;
    const modelSelectorRef = useRef(null);
    const [isImageReferenceDetailsOpen, setIsImageReferenceDetailsOpen] =
        useState(false);
    const lastMediaStorageSyncAtRef = useRef(0);
    const isRefreshingMediaLibraryRef = useRef(false);
    const videoThumbnailBackfillsAttemptedRef = useRef(new Set());
    const [videoThumbnailBackfillRunId, setVideoThumbnailBackfillRunId] =
        useState(0);

    const openImageReferenceDetails = useCallback(() => {
        setIsImageReferenceDetailsOpen(true);
    }, []);

    // Use custom selection hook
    const {
        selectedImages,
        selectedImagesObjects,
        setSelectedImages,
        setSelectedImagesObjects,
    } = useMediaSelection();
    const [selectedMediaFileIds, setSelectedMediaFileIds] = useState(new Set());
    const [selectedMediaFileObjects, setSelectedMediaFileObjects] = useState(
        [],
    );

    const isRefreshingMediaLibrary =
        isCleaningOrphanedMediaItems || isSyncingMediaItemsFromStorage;
    isRefreshingMediaLibraryRef.current = isRefreshingMediaLibrary;

    const refreshMediaLibrary = useCallback(
        async ({ force = false } = {}) => {
            if (isRefreshingMediaLibraryRef.current) {
                return;
            }

            const now = Date.now();
            if (
                !force &&
                now - lastMediaStorageSyncAtRef.current <
                    MEDIA_STORAGE_SYNC_THROTTLE_MS
            ) {
                return;
            }

            lastMediaStorageSyncAtRef.current = now;

            try {
                await cleanupOrphanedMediaItemsAsync();
                await syncMediaItemsFromStorageAsync();
            } catch (error) {
                console.error("Error refreshing media library:", error);
            }
        },
        [cleanupOrphanedMediaItemsAsync, syncMediaItemsFromStorageAsync],
    );

    useEffect(() => {
        refreshMediaLibrary({ force: true });
    }, [refreshMediaLibrary]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return undefined;
        }

        const handleWindowFocus = () => {
            refreshMediaLibrary();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                refreshMediaLibrary();
            }
        };

        const intervalId = window.setInterval(() => {
            if (document.visibilityState === "visible") {
                refreshMediaLibrary();
            }
        }, MEDIA_STORAGE_SYNC_INTERVAL_MS);

        window.addEventListener("focus", handleWindowFocus);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener("focus", handleWindowFocus);
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange,
            );
        };
    }, [refreshMediaLibrary]);

    // Load settings from user state, merging with API model list
    useEffect(() => {
        if (hasLocalMediaSettingsChangesRef.current) {
            return;
        }

        if (userState?.media?.settings && !isMigrationInProgress) {
            const migratedSettings = migrateSettings(userState.media.settings);
            const settingsWithNewModels = mergeWithApiModels(
                migratedSettings,
                mediaModels,
            );
            setSettingsAndRef(settingsWithNewModels);
        } else if (
            mediaModels?.length &&
            !Object.keys(settings.models).length
        ) {
            // Initial load — populate from API defaults
            setSettingsAndRef({ models: buildDefaultSettings(mediaModels) });
        }
    }, [userState?.media?.settings, isMigrationInProgress, mediaModels]); // eslint-disable-line react-hooks/exhaustive-deps

    // Set default model from API metadata when models first load
    useEffect(() => {
        if (!selectedModel && mediaModels?.length) {
            const defaultImage = mediaModels.find(
                (m) => m.category === "image" && m.isDefault,
            );
            const defaultModel = defaultImage || mediaModels[0];
            setSelectedModel(defaultModel?.modelId || "");
            setOutputType(defaultModel?.category || "image");
        }
    }, [mediaModels, selectedModel]);

    // No longer need to load images from user state - they come from the API now

    // Migrate from localStorage on first load (run only once)
    useEffect(() => {
        // Check if migration has already been completed
        const migrationCompleted = localStorage.getItem(
            "media-migration-completed",
        );
        if (migrationCompleted === "true") {
            return;
        }

        const localSettings = localStorage.getItem("media-generation-settings");
        const localMediaItems = localStorage.getItem("generated-media");

        // Check if there's data to migrate
        const hasDataToMigrate = localSettings || localMediaItems;
        if (!hasDataToMigrate) {
            // Mark migration as completed even if no data to migrate
            localStorage.setItem("media-migration-completed", "true");
            return;
        }

        // Add a flag to prevent multiple migrations in development mode
        const migrationInProgress = localStorage.getItem(
            "media-migration-in-progress",
        );
        if (migrationInProgress === "true") {
            console.log("🔄 Migration already in progress, skipping...");
            return;
        }

        // Run migration inline to avoid dependency issues
        const runMigration = async () => {
            console.log("🔄 Starting migration process...");
            localStorage.setItem("media-migration-in-progress", "true");
            setIsMigrationInProgress(true);
            try {
                // Migrate settings first
                if (localSettings) {
                    try {
                        const parsedSettings = JSON.parse(localSettings);
                        const settings = migrateSettings(parsedSettings);
                        const settingsWithNewModels = mergeWithApiModels(
                            settings,
                            mediaModels,
                        );
                        debouncedUpdateUserState({
                            media: { settings: settingsWithNewModels },
                        });
                    } catch (error) {
                        console.warn(
                            "Failed to parse localStorage settings:",
                            error,
                        );
                    }
                }

                // Migrate media items
                if (localMediaItems) {
                    try {
                        const parsedMediaItems = JSON.parse(localMediaItems);
                        console.log(
                            `📦 Found ${parsedMediaItems.length} media items to migrate:`,
                            parsedMediaItems.map((item) => ({
                                cortexRequestId: item.cortexRequestId,
                                type: item.type,
                                prompt: item.prompt,
                            })),
                        );

                        if (
                            Array.isArray(parsedMediaItems) &&
                            parsedMediaItems.length > 0
                        ) {
                            const result =
                                await migrateMediaItems.mutateAsync(
                                    parsedMediaItems,
                                );
                            console.log("✅ Migration result:", result);
                        }
                    } catch (error) {
                        console.warn(
                            "Failed to migrate media items from localStorage:",
                            error,
                        );
                    }
                }

                // Clear localStorage after successful migration
                localStorage.removeItem("media-generation-settings");
                localStorage.removeItem("generated-media");

                // Mark migration as completed
                localStorage.setItem("media-migration-completed", "true");
            } catch (error) {
                console.error("Migration failed:", error);
                // Don't mark as completed if there was an error
            } finally {
                setIsMigrationInProgress(false);
                localStorage.removeItem("media-migration-in-progress");
            }
        };

        // If no migration needed, ensure new models are available
        if (!hasDataToMigrate) {
            console.log(
                "🔄 No migration needed, ensuring new models are available...",
            );
            // Get current settings and merge new models
            const currentSettings = userState?.media?.settings || {};
            const settingsWithNewModels = mergeWithApiModels(
                currentSettings,
                mediaModels,
            );

            // Only update if we actually added new models
            const hasNewModels =
                Object.keys(settingsWithNewModels.models || {}).length >
                Object.keys(currentSettings.models || {}).length;

            if (hasNewModels) {
                debouncedUpdateUserState({
                    media: { settings: settingsWithNewModels },
                });
            }
        } else {
            runMigration();
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Use custom model selection hook
    const { getAvailableModels } = useModelSelection({
        settings,
        selectedModel,
        setSelectedModel,
        setOutputType,
        setQuality,
        getModelSettings,
    });

    // Pre-compute selected model metadata — avoids repeated .find() in render
    const selectedModelMeta = useMemo(
        () => modelMap.get(selectedModel),
        [modelMap, selectedModel],
    );
    const selectedReferenceRoleOptions = useMemo(() => {
        return (selectedModelMeta?.referenceImageRoles || []).map((role) => ({
            value: role,
            label: getReferenceImageRoleLabel(role, t),
        }));
    }, [selectedModelMeta, t]);
    const supportsVideoExtendReferences = useMemo(() => {
        return (
            (selectedModelMeta?.videoInputModes || []).includes(
                VIDEO_EXTEND_REFERENCE_ROLE,
            ) && getMaxVideoInputCount(selectedModelMeta) > 0
        );
    }, [selectedModelMeta]);
    const supportsInputImageRoles = selectedReferenceRoleOptions.length > 0;
    const supportsReferenceRoles =
        supportsInputImageRoles || supportsVideoExtendReferences;
    const isSelectedVeoModel = useMemo(
        () =>
            getModelProviderInfo(selectedModelMeta, selectedModel).key ===
            "veo",
        [selectedModelMeta, selectedModel],
    );

    // Get current model settings for display
    const currentModelSettings = useMemo(() => {
        return getModelSettings(settings, selectedModel, mediaModels);
    }, [settings, selectedModel, mediaModels]);

    const selectedModelType = useMemo(() => {
        return getModelType(selectedModel, settings, mediaModels);
    }, [selectedModel, settings, mediaModels]);
    const generationOutputType = getGenerationOutputType(selectedModelType);

    const getCurrentSettingValue = useCallback(
        (keys, fallback) => {
            const keyList = Array.isArray(keys) ? keys : [keys];
            for (const key of keyList) {
                if (currentModelSettings?.[key] !== undefined) {
                    return currentModelSettings[key];
                }
            }
            for (const key of keyList) {
                if (selectedModelMeta?.mediaDefaults?.[key] !== undefined) {
                    return selectedModelMeta.mediaDefaults[key];
                }
            }
            return fallback;
        },
        [currentModelSettings, selectedModelMeta],
    );
    const currentMediaControls = useMemo(
        () =>
            getAugmentedMediaControls(
                selectedModelMeta,
                t,
                currentModelSettings,
            ),
        [currentModelSettings, selectedModelMeta, t],
    );
    const currentStructuredMediaControls = useMemo(
        () => currentMediaControls.filter(isTextMediaControl),
        [currentMediaControls],
    );
    const currentCompactMediaControls = useMemo(
        () =>
            currentMediaControls.filter(
                (control) => !isTextMediaControl(control),
            ),
        [currentMediaControls],
    );
    const supportsLyricsInput = useMemo(
        () =>
            selectedModelType === "audio" &&
            Boolean(
                selectedModelMeta?.mediaControls?.some(
                    (control) => control.key === "lyricsOptimizer",
                ) || selectedModelMeta?.mediaDefaults?.lyrics !== undefined,
            ),
        [selectedModelMeta, selectedModelType],
    );
    const isCurrentModelInstrumental =
        getCurrentSettingValue("isInstrumental", true) === true;
    const showLyricsInput = supportsLyricsInput && !isCurrentModelInstrumental;
    const currentLyrics = lyricsByModel[selectedModel] || "";
    const updateCurrentLyrics = useCallback(
        (value) => {
            setLyricsByModel((prev) => ({
                ...prev,
                [selectedModel]: value,
            }));
        },
        [selectedModel],
    );
    const getGenerationSettings = useCallback(() => {
        if (!supportsLyricsInput) return settingsRef.current || settings;

        const baseSettings = settingsRef.current || settings || {};
        const modelSettings = {
            ...getModelSettings(baseSettings, selectedModel, mediaModels),
        };
        const trimmedLyrics = currentLyrics.trim();

        if (showLyricsInput && trimmedLyrics) {
            modelSettings.lyrics = trimmedLyrics;
        } else {
            delete modelSettings.lyrics;
        }

        return sanitizeMediaSettings({
            ...baseSettings,
            models: {
                ...(baseSettings.models || {}),
                [selectedModel]: modelSettings,
            },
        });
    }, [
        currentLyrics,
        mediaModels,
        selectedModel,
        settings,
        settingsRef,
        showLyricsInput,
        supportsLyricsInput,
    ]);
    const hasCurrentOutputSettings = useMemo(() => {
        const mediaToggles = selectedModelMeta?.mediaToggles || [];
        return (
            (selectedModelType !== "audio" &&
                selectedModelType !== "tts" &&
                getAvailableAspectRatios(selectedModel).length > 0) ||
            (selectedModelMeta?.availableImageSizes?.length || 0) > 0 ||
            (selectedModelType === "video" &&
                getAvailableDurations(selectedModel).length > 0) ||
            (selectedModelMeta?.availableResolutions?.length || 0) > 0 ||
            mediaToggles.includes("generateAudio") ||
            mediaToggles.includes("cameraFixed") ||
            mediaToggles.includes("optimizePrompt") ||
            currentMediaControls.length > 0
        );
    }, [
        currentMediaControls,
        getAvailableAspectRatios,
        getAvailableDurations,
        selectedModel,
        selectedModelMeta,
        selectedModelType,
    ]);

    const updateCurrentModelSetting = useCallback(
        (key, value) => {
            let nextSettings;
            hasLocalMediaSettingsChangesRef.current = true;

            setSettingsAndRef((prev) => {
                const currentModel =
                    prev.models?.[selectedModel] ||
                    getModelSettings(prev, selectedModel, mediaModels);
                nextSettings = {
                    ...prev,
                    models: {
                        ...(prev.models || {}),
                        [selectedModel]: {
                            ...currentModel,
                            [key]: value,
                            ...(key === "image_size"
                                ? { imageSize: value, size: value }
                                : {}),
                        },
                    },
                };
                return nextSettings;
            });

            if (nextSettings) {
                debouncedUpdateUserState({
                    media: {
                        ...userState?.media,
                        settings: nextSettings,
                    },
                });
            }
        },
        [
            debouncedUpdateUserState,
            mediaModels,
            selectedModel,
            setSettingsAndRef,
            userState?.media,
        ],
    );

    const selectedImageObjectsForGeneration = useMemo(() => {
        return selectedImagesObjects.filter(
            (img) => img.type === "image" || img.type === "video",
        );
    }, [selectedImagesObjects]);
    const selectedAudioObjectsForGeneration = useMemo(
        () => selectedImagesObjects.filter(hasUsableInputAudioUrl),
        [selectedImagesObjects],
    );
    const selectedReferenceObjectsForDisplay = useMemo(
        () => [
            ...selectedImageObjectsForGeneration,
            ...selectedAudioObjectsForGeneration,
        ],
        [selectedAudioObjectsForGeneration, selectedImageObjectsForGeneration],
    );
    const defaultExtendVideoReference = useMemo(
        () =>
            selectedImageObjectsForGeneration.find(
                (item) => item?.type === "video",
            ),
        [selectedImageObjectsForGeneration],
    );
    const selectedImageCount = selectedImageObjectsForGeneration.length;
    const selectedReferenceCount = selectedReferenceObjectsForDisplay.length;
    const getSupportedReferenceRolesForMedia = useCallback(
        (media) => {
            const imageRoles = selectedModelMeta?.referenceImageRoles || [];
            if (media?.type !== "image" && media?.type !== "video") return [];
            if (media?.type !== "video") return imageRoles;

            const videoRoles = imageRoles.filter(
                (role) =>
                    role === "reference" ||
                    isVideoFrameReferenceRole(selectedModelMeta, role),
            );
            if (supportsVideoExtendReferences) {
                videoRoles.push(VIDEO_EXTEND_REFERENCE_ROLE);
            }
            return Array.from(new Set(videoRoles));
        },
        [selectedModelMeta, supportsVideoExtendReferences],
    );

    const getSelectedReferenceRoleOptions = useCallback(
        (media) =>
            getSupportedReferenceRolesForMedia(media).map((role) => ({
                value: role,
                label: getReferenceImageRoleLabel(role, t),
            })),
        [getSupportedReferenceRolesForMedia, t],
    );

    const getSelectedImageRole = useCallback(
        (image) => {
            if (!supportsReferenceRoles) return "";
            const supportedRoles = getSupportedReferenceRolesForMedia(image);
            const imageId = getSelectedMediaId(image);
            const selectedRole = inputImageRolesById[imageId];
            if (supportedRoles.includes(selectedRole)) return selectedRole;
            return getDefaultReferenceImageRole(supportedRoles, {
                preferExtend:
                    image?.type === "video" &&
                    image === defaultExtendVideoReference,
            });
        },
        [
            defaultExtendVideoReference,
            getSupportedReferenceRolesForMedia,
            inputImageRolesById,
            supportsReferenceRoles,
        ],
    );

    const selectedInputImageRolesById = useMemo(() => {
        if (!supportsReferenceRoles) return {};
        return Object.fromEntries(
            selectedImageObjectsForGeneration
                .map((image, index) => [
                    getSelectedMediaId(image),
                    getSelectedImageRole(image, index),
                ])
                .filter(([id, role]) => id && role),
        );
    }, [
        getSelectedImageRole,
        selectedImageObjectsForGeneration,
        supportsReferenceRoles,
    ]);

    const handleSelectedImageRoleChange = useCallback((image, role) => {
        const imageId = getSelectedMediaId(image);
        if (!imageId) return;
        setInputImageRolesById((prev) => ({
            ...prev,
            [imageId]: role,
        }));
    }, []);

    const handleRemoveSelectedReference = useCallback(
        (image) => {
            const imageId = getSelectedMediaId(image);
            const nextSelectedObjects = selectedImagesObjects.filter((item) => {
                if (item === image) return false;
                if (!imageId) return true;
                return getSelectedMediaId(item) !== imageId;
            });

            setSelectedImages(new Set(nextSelectedObjects.map(createFileId)));
            setSelectedImagesObjects(nextSelectedObjects);

            if (imageId) {
                setInputImageRolesById((prev) => {
                    if (!(imageId in prev)) return prev;
                    const next = { ...prev };
                    delete next[imageId];
                    return next;
                });
            }

            if (nextSelectedObjects.length === 0) {
                setIsImageReferenceDetailsOpen(false);
            }
        },
        [selectedImagesObjects, setSelectedImages, setSelectedImagesObjects],
    );

    const handleAddSelectedFilesAsReferences = useCallback(
        (files = []) => {
            if (!files.length) return;

            const nextReferencesById = new Map();
            selectedImagesObjects.forEach((item) => {
                const id = getSelectedMediaId(item) || createFileId(item);
                if (id) nextReferencesById.set(id, item);
            });
            files.forEach((file) => {
                const media = file?._mediaItem || file;
                const id = getSelectedMediaId(media) || createFileId(media);
                if (id) nextReferencesById.set(id, media);
            });

            const nextReferenceObjects = Array.from(
                nextReferencesById.values(),
            );
            setSelectedImages(new Set(nextReferenceObjects.map(createFileId)));
            setSelectedImagesObjects(nextReferenceObjects);
            setIsImageReferenceDetailsOpen(nextReferenceObjects.length > 0);
            setTimeout(() => {
                promptRef.current?.focus();
            }, 0);
        },
        [selectedImagesObjects, setSelectedImages, setSelectedImagesObjects],
    );

    const handleMediaFolderChange = useCallback((folderPath) => {
        setCurrentMediaFolder(normalizeMediaFolderPath(folderPath));
    }, []);

    const uploadVideoFrameReference = useCallback(
        async (videoMedia, role) => {
            const sourceUrl = getSelectedMediaUrl(videoMedia);
            const sourceBlobPath = getMediaBlobPath(videoMedia);
            const frameTarget = getVideoFrameReferenceTarget(
                sourceBlobPath,
                role,
            );
            if (
                !sourceUrl ||
                !sourceBlobPath ||
                !frameTarget ||
                !isVideoFrameReferenceRole(selectedModelMeta, role)
            ) {
                return null;
            }

            const existingFrame = await checkFileByBlobPath(
                frameTarget.blobPath,
                {
                    storageTarget: mediaStorageTarget,
                    serverUrl: "/media-helper",
                },
            );
            if (existingFrame?.url) {
                return {
                    ...videoMedia,
                    type: "image",
                    url: existingFrame.url,
                    azureUrl: existingFrame.url,
                    gcsUrl: existingFrame.gcs || existingFrame.gcsUrl,
                    blobPath: existingFrame.blobPath || frameTarget.blobPath,
                    hash: existingFrame.hash,
                    inputImageRole: role,
                    prompt: videoMedia.prompt || t("Video frame reference"),
                };
            }

            const frameBlob = await captureVideoFrameBlob(
                getDownloadUrl(sourceUrl),
                role,
            );
            const frameFile = new File([frameBlob], frameTarget.filename, {
                type: "image/jpeg",
            });
            const upload = await uploadFileToMediaHelper(frameFile, {
                storageTarget: mediaStorageTarget,
                checkHash: false,
                serverUrl: "/media-helper",
                subPath: frameTarget.subPath,
            });

            if (!upload?.url) {
                throw new Error("Video frame upload did not return a URL");
            }

            return {
                ...videoMedia,
                type: "image",
                url: upload.url,
                azureUrl: upload.url,
                gcsUrl: upload.gcs,
                blobPath: upload.blobPath || frameTarget.blobPath,
                hash: upload.hash,
                inputImageRole: role,
                prompt: videoMedia.prompt || t("Video frame reference"),
            };
        },
        [mediaStorageTarget, selectedModelMeta, t],
    );

    const backfillVideoThumbnail = useCallback(
        async (videoMedia) => {
            const sourceUrl = getSelectedMediaUrl(videoMedia);
            if (!sourceUrl || !videoMedia?.taskId) return;

            const frameBlob = await captureVideoFrameBlob(
                getDownloadUrl(sourceUrl),
                "thumbnail",
            );
            const sourceId =
                getSelectedMediaId(videoMedia) || Date.now().toString(36);
            const thumbnailFile = new File(
                [frameBlob],
                `thumbnail-${sourceId}.jpg`,
                {
                    type: "image/jpeg",
                },
            );
            const upload = await uploadFileToMediaHelper(thumbnailFile, {
                storageTarget: mediaStorageTarget,
                checkHash: true,
                serverUrl: "/media-helper",
                subPath: "video-thumbnails",
            });

            if (!upload?.url) {
                throw new Error("Video thumbnail upload did not return a URL");
            }

            await updateMediaItem.mutateAsync({
                taskId: videoMedia.taskId,
                updates: {
                    thumbnailUrl: upload.url,
                    thumbnailAzureUrl: upload.url,
                    thumbnailGcsUrl: upload.gcs,
                    thumbnailBlobPath: upload.blobPath,
                    thumbnailHash: upload.hash,
                },
            });
        },
        [mediaStorageTarget, updateMediaItem],
    );

    useEffect(() => {
        const candidates = sortedImages
            .filter(needsVideoThumbnailBackfill)
            .filter((media) => {
                const id = getSelectedMediaId(media);
                return (
                    id && !videoThumbnailBackfillsAttemptedRef.current.has(id)
                );
            })
            .slice(0, MAX_VIDEO_THUMBNAIL_BACKFILLS_PER_BATCH);

        if (candidates.length === 0) return;

        let isActive = true;
        const backfills = candidates.map((media) => {
            const id = getSelectedMediaId(media);
            videoThumbnailBackfillsAttemptedRef.current.add(id);
            return backfillVideoThumbnail(media).catch((error) => {
                console.warn("Video thumbnail backfill failed", {
                    taskId: media?.taskId,
                    error,
                });
            });
        });

        Promise.allSettled(backfills).then(() => {
            if (isActive) {
                setVideoThumbnailBackfillRunId((current) => current + 1);
            }
        });

        return () => {
            isActive = false;
        };
    }, [backfillVideoThumbnail, sortedImages, videoThumbnailBackfillRunId]);

    const prepareSelectedReferencesForGeneration = useCallback(
        async (references) => {
            const preparedReferences = await Promise.all(
                references.map(async (reference, index) => {
                    if (reference.type !== "video") {
                        return reference;
                    }
                    const role = getSelectedImageRole(reference, index);
                    if (role === VIDEO_EXTEND_REFERENCE_ROLE) {
                        return {
                            ...reference,
                            inputImageRole: role,
                        };
                    }
                    return uploadVideoFrameReference(reference, role);
                }),
            );

            return preparedReferences.filter(Boolean);
        },
        [getSelectedImageRole, uploadVideoFrameReference],
    );

    const selectedReferenceLimitState = useMemo(() => {
        const entries = selectedImageObjectsForGeneration.map((item, index) => {
            const role = getSelectedImageRole(item, index);
            const id = getSelectedMediaId(item);
            return {
                item,
                index,
                key: id || `${index}`,
                role,
                isVideoExtend:
                    item?.type === "video" &&
                    role === VIDEO_EXTEND_REFERENCE_ROLE,
                isVideoFrame:
                    item?.type === "video" &&
                    isVideoFrameReferenceRole(selectedModelMeta, role),
            };
        });
        const imageEntries = entries.filter(
            (entry) => entry.item?.type === "image" || entry.isVideoFrame,
        );
        const virtualImageReferences = imageEntries.map((entry) => ({
            ...entry.item,
            type: "image",
            inputImageRole: entry.role,
            referenceLimitKey: entry.key,
        }));
        const allowedImageKeys = new Set(
            selectImageReferencesWithinLimits(virtualImageReferences, {
                modelMeta: selectedModelMeta,
                modelSettings: currentModelSettings,
                getRole: (item) => item.inputImageRole,
            }).map((item) => item.referenceLimitKey),
        );
        const maxVideos = getModelInputVideosRange(
            selectedModelMeta,
            currentModelSettings,
        ).max;
        const allowedVideoKeys = new Set(
            entries
                .filter((entry) => entry.isVideoExtend)
                .slice(0, maxVideos)
                .map((entry) => entry.key),
        );
        const allowedKeys = new Set([...allowedImageKeys, ...allowedVideoKeys]);
        const excludedKeys = new Set(
            entries
                .filter((entry) => !allowedKeys.has(entry.key))
                .map((entry) => entry.key),
        );

        return {
            allowedKeys,
            excludedKeys,
            allowedImageCount: allowedImageKeys.size,
            allowedVideoCount: allowedVideoKeys.size,
            allowedReferences: entries
                .filter((entry) => allowedKeys.has(entry.key))
                .map((entry) => entry.item),
        };
    }, [
        currentModelSettings,
        getSelectedImageRole,
        selectedImageObjectsForGeneration,
        selectedModelMeta,
    ]);
    const selectedReferencesForGeneration =
        selectedReferenceLimitState.allowedReferences;
    const selectedAudioLimitState = useMemo(() => {
        const audioRange = getModelInputAudioRange(
            selectedModelMeta,
            currentModelSettings,
        );
        const maxAudio = audioRange?.max ?? 0;
        const entries = selectedAudioObjectsForGeneration.map(
            (item, index) => ({
                item,
                key: getSelectedMediaId(item) || `${index}`,
            }),
        );
        const allowedKeys = new Set(
            audioRange
                ? entries.slice(0, maxAudio).map((entry) => entry.key)
                : [],
        );
        const excludedKeys = new Set(
            entries
                .filter((entry) => !allowedKeys.has(entry.key))
                .map((entry) => entry.key),
        );

        return {
            range: audioRange,
            allowedKeys,
            excludedKeys,
            allowedReferences: entries
                .filter((entry) => allowedKeys.has(entry.key))
                .map((entry) => entry.item),
        };
    }, [
        currentModelSettings,
        selectedAudioObjectsForGeneration,
        selectedModelMeta,
    ]);
    const selectedAudioForInput =
        selectedAudioLimitState.range &&
        selectedAudioObjectsForGeneration.length >=
            selectedAudioLimitState.range.min &&
        selectedAudioObjectsForGeneration.length <=
            selectedAudioLimitState.range.max
            ? selectedAudioLimitState.allowedReferences[0] || null
            : null;
    const unsupportedVeoInputImages = useMemo(() => {
        if (!isSelectedVeoModel) return [];
        return selectedImageObjectsForGeneration.filter(
            isUnsupportedVeoInputImage,
        );
    }, [isSelectedVeoModel, selectedImageObjectsForGeneration]);
    const veoInputImageFormatMessage = useMemo(() => {
        if (unsupportedVeoInputImages.length === 0) return "";
        const names = unsupportedVeoInputImages
            .map(getSelectedMediaDisplayName)
            .filter(Boolean)
            .slice(0, 2);
        const suffix =
            unsupportedVeoInputImages.length > names.length
                ? ` ${t("and")} ${
                      unsupportedVeoInputImages.length - names.length
                  } ${t("more")}`
                : "";
        const imageNames =
            names.length > 0 ? ` ${names.join(", ")}${suffix}` : "";
        return `${t("Veo input images must be JPEG or PNG.")}${imageNames}`;
    }, [unsupportedVeoInputImages, t]);
    const getSelectedReferenceError = useCallback(
        (image, index = 0) => {
            if (image?.type === "audio") {
                const id = getSelectedMediaId(image);
                const key = id || `${index}`;
                if (
                    !selectedAudioLimitState.range ||
                    selectedAudioLimitState.excludedKeys.has(key)
                ) {
                    return t(
                        "This reference will not be used by the selected model.",
                    );
                }
                return "";
            }

            if (!isSelectedVeoModel || !isUnsupportedVeoInputImage(image)) {
                const id = getSelectedMediaId(image);
                const key = id || `${index}`;
                if (selectedReferenceLimitState.excludedKeys.has(key)) {
                    return t(
                        "This reference will not be used by the selected model.",
                    );
                }
                return "";
            }

            const name = getSelectedMediaDisplayName(image);
            return `${t("Veo input images must be JPEG or PNG.")}${
                name ? ` ${name}` : ""
            }`;
        },
        [
            isSelectedVeoModel,
            selectedAudioLimitState.excludedKeys,
            selectedAudioLimitState.range,
            selectedReferenceLimitState.excludedKeys,
            t,
        ],
    );
    const selectedModelReferenceMessage = useMemo(() => {
        const imageRange = getModelInputImagesRange(
            selectedModelMeta,
            currentModelSettings,
        );
        if (selectedReferenceLimitState.allowedImageCount < imageRange.min) {
            return t("Attach more references");
        }

        const videoRange = getModelInputVideosRange(
            selectedModelMeta,
            currentModelSettings,
        );
        if (selectedReferenceLimitState.allowedVideoCount < videoRange.min) {
            return t("Attach more references");
        }

        const audioRange = selectedAudioLimitState.range;
        if (audioRange) {
            const selectedAudioCount = selectedAudioObjectsForGeneration.length;
            const missingAudioMessage =
                selectedModelType === "tts"
                    ? t("Attach one voice reference")
                    : t("Attach one music item");
            const tooManyAudioMessage =
                selectedModelType === "tts"
                    ? t("Attach only one voice reference")
                    : t("Attach only one music item");
            if (selectedAudioCount < audioRange.min) {
                return missingAudioMessage;
            }
            if (selectedAudioCount > audioRange.max) {
                return tooManyAudioMessage;
            }
        }

        return "";
    }, [
        currentModelSettings,
        selectedAudioLimitState.range,
        selectedAudioObjectsForGeneration.length,
        selectedModelMeta,
        selectedModelType,
        selectedReferenceLimitState.allowedImageCount,
        selectedReferenceLimitState.allowedVideoCount,
        t,
    ]);
    const voiceDesignDescriptionMessage = useMemo(() => {
        if (selectedModelType !== "tts") return "";
        if (!isVoiceDesignMode(currentModelSettings, selectedModelMeta)) {
            return "";
        }
        if (
            String(
                getVoiceDescriptionValue(
                    currentModelSettings,
                    selectedModelMeta,
                ) || "",
            ).trim()
        ) {
            return "";
        }
        return t("Describe the voice before generating.");
    }, [currentModelSettings, selectedModelMeta, selectedModelType, t]);
    const generationValidationMessage =
        veoInputImageFormatMessage ||
        selectedModelReferenceMessage ||
        voiceDesignDescriptionMessage;
    const canGenerate =
        (Boolean(prompt.trim()) ||
            (selectedModelType === "audio" && selectedImageCount > 0)) &&
        !generationValidationMessage;
    const enhancePromptLabel =
        selectedModelType === "tts"
            ? t("Enhance speech prompt")
            : selectedModelType === "audio"
              ? t("Enhance music prompt")
              : t("Enhance prompt");
    const canStartPromptIdea = !prompt.trim();
    const promptAssistLabel = canStartPromptIdea
        ? selectedModelType === "audio"
            ? t("Help me start a music prompt")
            : selectedModelType === "tts"
              ? t("Help me start a speech prompt")
              : t("Help me start a prompt")
        : enhancePromptLabel;
    const PromptAssistIcon = canStartPromptIdea ? Lightbulb : Sparkles;
    const promptAssistClassName = canStartPromptIdea
        ? "flex-shrink-0 p-1.5 text-gray-400 hover:text-cyan-600 dark:text-gray-500 dark:hover:text-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        : "flex-shrink-0 p-1.5 text-gray-500 hover:text-amber-500 dark:text-gray-400 dark:hover:text-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
    // Use custom media generation hook
    const {
        generateMedia,
        handleModifySelected: handleModifySelectedHook,
        handleCombineSelected: handleCombineSelectedHook,
    } = useMediaGeneration({
        selectedModel,
        outputType: generationOutputType,
        settings,
        settingsRef,
        outputFolder: currentMediaFolder,
        runTask,
        createMediaItem,
        promptRef,
        setLoading,
    });

    // Optimize prompt using AI
    const handleOptimizePrompt = useCallback(async () => {
        const promptText = prompt.trim();
        if (isOptimizing) return;

        setIsOptimizing(true);
        try {
            const selectedReferences = selectedReferencesForGeneration
                .map((reference, index) => ({
                    url: getSelectedMediaUrl(reference),
                    role: getSelectedImageRole(reference, index),
                }))
                .filter((reference) => reference.url);
            const response = await client.query({
                query: QUERIES.MEDIA_PROMPT_ASSISTANT,
                variables: {
                    prompt: promptText,
                    mediaType: selectedModelType,
                    model: selectedModel,
                    references: selectedReferences.map(
                        (reference) => reference.url,
                    ),
                    referenceRoles: selectedReferences
                        .map((reference) => reference.role)
                        .filter(Boolean),
                    hasInputImages: selectedReferences.length > 0,
                    referenceCount: selectedReferences.length,
                },
            });

            const assistedPrompt =
                response.data?.media_prompt_assistant?.result;
            if (assistedPrompt) {
                setPrompt(assistedPrompt.trim());
                setTimeout(() => {
                    promptRef.current?.focus();
                }, 0);
            }
        } catch (error) {
            console.error("Error assisting prompt:", error);
        } finally {
            setIsOptimizing(false);
        }
    }, [
        client,
        getSelectedImageRole,
        isOptimizing,
        prompt,
        selectedModel,
        selectedModelType,
        selectedReferencesForGeneration,
    ]);
    const handlePromptAssist = useCallback(() => {
        handleOptimizePrompt();
    }, [handleOptimizePrompt]);

    // Wrapper function to pass required parameters to hooks
    const handleCombineSelectedWrapper = useCallback(async () => {
        try {
            const selectedReferences =
                await prepareSelectedReferencesForGeneration(
                    selectedReferencesForGeneration,
                );
            if (selectedReferences.length === 0) {
                setLoading(false);
                return;
            }
            const handler =
                selectedReferences.length === 1
                    ? handleModifySelectedHook
                    : handleCombineSelectedHook;
            await handler({
                prompt,
                selectedImagesObjects: selectedReferences,
                outputType: generationOutputType,
                selectedModel,
                settings: getGenerationSettings(),
                runTask,
                createMediaItem,
                promptRef,
                outputFolder: currentMediaFolder,
                inputImageRolesById: selectedInputImageRolesById,
                inputAudio: selectedAudioForInput,
            });
        } catch (error) {
            console.error("Error preparing media references:", error);
            setLoading(false);
        }
    }, [
        prompt,
        selectedReferencesForGeneration,
        selectedInputImageRolesById,
        selectedAudioForInput,
        generationOutputType,
        selectedModel,
        getGenerationSettings,
        runTask,
        createMediaItem,
        promptRef,
        currentMediaFolder,
        handleModifySelectedHook,
        handleCombineSelectedHook,
        prepareSelectedReferencesForGeneration,
        setLoading,
    ]);

    // Use wrapper function that calls the custom hooks
    const handleCombineSelected = handleCombineSelectedWrapper;

    // Use custom file upload hook
    const { handleFileSelect, isUploading } = useFileUpload({
        createMediaItem,
        settings,
        t,
        promptRef,
        setSelectedImages,
        setSelectedImagesObjects,
    });

    // Use custom bulk operations hook
    const { handleBulkAction, isDownloading } = useBulkOperations({
        selectedImagesObjects: selectedMediaFileObjects,
        deleteMediaItem,
        setSelectedImages: setSelectedMediaFileIds,
        setSelectedImagesObjects: setSelectedMediaFileObjects,
        setShowDeleteSelectedConfirm: () => {},
        t,
    });

    const handleUnifiedSelectionChange = useCallback(
        (selectedObjects, selectedIds) => {
            setSelectedMediaFileIds(new Set(selectedIds));
            setSelectedMediaFileObjects(selectedObjects);
        },
        [],
    );
    const getMediaBulkActionVisibility = useCallback(
        ({ selectedObjects = [] } = {}) => {
            if (!selectedObjects.some(isFailedMediaFile)) return {};
            return {
                attach: false,
                download: false,
                move: false,
            };
        },
        [],
    );

    // Handle download with error handling
    const handleDownload = useCallback(
        async (files = selectedMediaFileObjects) => {
            try {
                await handleBulkAction("download", files);
            } catch (error) {
                setDownloadError(error.message);
                setShowDownloadError(true);
            }
        },
        [handleBulkAction, selectedMediaFileObjects],
    );

    const handleUnifiedDelete = useCallback(
        async (files) => {
            const routingParams = buildMediaHelperFileParams({
                storageTarget: mediaStorageTarget,
            });

            for (const file of files) {
                const media = file?._mediaItem || file;
                if (media?.taskId) {
                    await deleteMediaItem.mutateAsync(media.taskId);
                    continue;
                }

                const blobPath = file?.blobPath || media?.blobPath;
                const hash = file?.hash || media?.hash;
                if (!blobPath && !hash) continue;

                const deleteUrl = new URL(
                    "/api/files/delete",
                    window.location.origin,
                );
                if (blobPath) deleteUrl.searchParams.set("blobPath", blobPath);
                if (hash) deleteUrl.searchParams.set("hash", hash);
                for (const [key, value] of Object.entries(routingParams)) {
                    deleteUrl.searchParams.set(key, value);
                }
                const response = await fetch(deleteUrl.toString(), {
                    method: "DELETE",
                });
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || response.statusText);
                }
            }
            const deletedIds = new Set(
                files
                    .map((file) => getSelectedMediaId(file?._mediaItem || file))
                    .filter(Boolean),
            );
            if (deletedIds.size > 0) {
                const nextReferenceObjects = selectedImagesObjects.filter(
                    (item) => !deletedIds.has(getSelectedMediaId(item)),
                );
                setSelectedImages(
                    new Set(nextReferenceObjects.map(createFileId)),
                );
                setSelectedImagesObjects(nextReferenceObjects);
            }
        },
        [
            deleteMediaItem,
            mediaStorageTarget,
            selectedImagesObjects,
            setSelectedImages,
            setSelectedImagesObjects,
        ],
    );

    const handleUnifiedRename = useCallback(
        async (file, metadata = {}) => {
            const media = file?._mediaItem || file;
            const newFilename = String(metadata.displayFilename || "").trim();
            const currentFilename = getMoveFilename(file);
            const blobPath =
                file?.blobPath ||
                getMediaBlobPath(file) ||
                getMediaBlobPath(media);
            const hash = file?.hash || media?.hash;
            const status = String(media?.status || "").toLowerCase();
            const isPendingGeneratedMedia = [
                "pending",
                "processing",
                "queued",
            ].includes(status);

            if (!newFilename || newFilename === currentFilename) return;
            if (newFilename.includes("/") || newFilename.includes("\\")) {
                throw new Error(t("Filenames cannot include folders."));
            }
            if (!blobPath) {
                throw new Error(
                    isPendingGeneratedMedia
                        ? t("Generated media can be renamed after it finishes.")
                        : t("No renameable media file selected."),
                );
            }

            const routingParams = buildMediaHelperFileParams({
                storageTarget: mediaStorageTarget,
            });
            const targetBlobPath = getRenamedMediaBlobPath({
                blobPath,
                filename: newFilename,
            });

            const response = await fetch("/api/files/rename", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    blobPath,
                    hash,
                    newFilename,
                    targetBlobPath,
                    ...routingParams,
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || response.statusText);
            }

            const data = await response.json().catch(() => ({}));
            const renameResult = getMoveResultPayload(data);

            if (media?.taskId) {
                const renamedBlobPath = renameResult.blobPath || targetBlobPath;
                const updates = {
                    blobPath: renamedBlobPath,
                };

                if (renameResult.hash || hash) {
                    updates.hash = renameResult.hash || hash;
                }
                if (renameResult.url) {
                    updates.url = renameResult.url;
                }
                if (renameResult.azureUrl) {
                    updates.azureUrl = renameResult.azureUrl;
                }
                if (renameResult.gcsUrl) {
                    updates.gcsUrl = renameResult.gcsUrl;
                }

                await updateMediaItem.mutateAsync({
                    taskId: media.taskId,
                    updates,
                });
            }

            await refreshMediaLibrary({ force: true });
        },
        [mediaStorageTarget, refreshMediaLibrary, t, updateMediaItem],
    );

    const handleUnifiedMove = useCallback(
        async (files, targetFolder) => {
            const normalizedInputTarget =
                normalizeMediaFolderPath(targetFolder);
            const normalizedTarget =
                normalizedInputTarget === "media"
                    ? ""
                    : normalizedInputTarget.startsWith("media/")
                      ? normalizedInputTarget.slice("media/".length)
                      : normalizedInputTarget;
            const routingParams = buildMediaHelperFileParams({
                storageTarget: mediaStorageTarget,
            });

            let movedCount = 0;
            let skippedCount = 0;
            let pendingMoveCount = 0;

            try {
                for (const file of files) {
                    const media = file?._mediaItem || file;
                    const blobPath =
                        file?.blobPath ||
                        getMediaBlobPath(file) ||
                        getMediaBlobPath(media);
                    const hash = file?.hash || media?.hash;
                    const filename = getMoveFilename(file);
                    const status = String(media?.status || "").toLowerCase();
                    const isPendingGeneratedMedia = [
                        "pending",
                        "processing",
                        "queued",
                    ].includes(status);

                    if (!filename || !blobPath) {
                        if (
                            media?.taskId &&
                            !blobPath &&
                            isPendingGeneratedMedia
                        ) {
                            pendingMoveCount += 1;
                        }
                        skippedCount += 1;
                        continue;
                    }

                    const newFilename = normalizedTarget
                        ? `${normalizedTarget}/${filename}`
                        : filename;
                    const targetBlobPath = getMovedMediaBlobPath({
                        targetFolder: normalizedTarget,
                        filename,
                    });

                    const response = await fetch("/api/files/rename", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            blobPath,
                            hash,
                            newFilename,
                            targetBlobPath,
                            ...routingParams,
                        }),
                    });

                    if (!response.ok) {
                        const data = await response.json().catch(() => ({}));
                        throw new Error(data.error || response.statusText);
                    }

                    const data = await response.json().catch(() => ({}));
                    const moveResult = getMoveResultPayload(data);

                    if (media?.taskId) {
                        const movedBlobPath =
                            moveResult.blobPath || targetBlobPath;
                        const updates = {
                            blobPath: movedBlobPath,
                        };

                        if (moveResult.hash || hash) {
                            updates.hash = moveResult.hash || hash;
                        }
                        if (moveResult.url) {
                            updates.url = moveResult.url;
                        }
                        if (moveResult.azureUrl) {
                            updates.azureUrl = moveResult.azureUrl;
                        }
                        if (moveResult.gcsUrl) {
                            updates.gcsUrl = moveResult.gcsUrl;
                        }
                        updates.outputFolder = normalizedTarget;

                        await updateMediaItem.mutateAsync({
                            taskId: media.taskId,
                            updates,
                        });
                    }

                    movedCount += 1;
                }

                if (movedCount === 0) {
                    if (pendingMoveCount > 0) {
                        throw new Error(
                            t(
                                "Generated media can be moved after it finishes.",
                            ),
                        );
                    }
                    throw new Error(t("No movable media files selected."));
                }

                return { movedCount, skippedCount };
            } finally {
                await refreshMediaLibrary({ force: true });
            }
        },
        [mediaStorageTarget, refreshMediaLibrary, t, updateMediaItem],
    );

    const renderMediaFileStatus = useCallback(
        (file) => {
            const media = file?._mediaItem || file;
            const status = String(media?.status || "").toLowerCase();
            if (["pending", "processing", "queued"].includes(status)) {
                return (
                    <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-200">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {t("Processing")}
                    </span>
                );
            }
            if (["failed", "error"].includes(status)) {
                return (
                    <span
                        className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/35 dark:text-red-200"
                        title={media?.error?.message || t("Failed")}
                    >
                        <AlertCircle className="h-3 w-3" />
                        {t("Failed")}
                    </span>
                );
            }
            if (media?.model && media.model !== "storage-sync") {
                return (
                    <span className="truncate text-[10px] text-gray-400 dark:text-gray-500">
                        {getDisplayName(media.model)}
                    </span>
                );
            }
            return null;
        },
        [getDisplayName, t],
    );

    const renderMediaFileOverlay = useCallback(() => null, []);

    const renderMediaPreviewDialog = useCallback(
        ({ file, onClose, autoPlay = false }) => {
            const media = file?._mediaItem || file;
            return (
                <ImageModal
                    key={
                        media?.cortexRequestId ||
                        media?.taskId ||
                        media?.azureUrl ||
                        media?.url ||
                        "media-preview"
                    }
                    show={true}
                    image={media}
                    audioPlayback={audioPlayback[getMediaPlaybackId(media)]}
                    mediaPlaybackId={getMediaPlaybackId(media)}
                    onAudioPlaybackChange={handleAudioPlaybackChange}
                    autoPlayPreview={autoPlay}
                    onHide={() => {
                        if (media?.type === "audio") {
                            activateAudioSurface(media, "tile");
                        }
                        onClose();
                    }}
                />
            );
        },
        [
            activateAudioSurface,
            audioPlayback,
            getMediaPlaybackId,
            handleAudioPlaybackChange,
        ],
    );

    // Handle bulk tagging
    const handleBulkTag = useCallback(async () => {
        if (selectedMediaFileObjects.length === 0) return;

        if (bulkTagMode === "auto") {
            try {
                const selectedTaskIds = selectedMediaFileObjects
                    .map(getSelectedMediaTaskId)
                    .filter(Boolean);

                await Promise.all(
                    selectedTaskIds.map((taskId) =>
                        autoTagMutation.mutateAsync({
                            taskId,
                        }),
                    ),
                );

                setShowBulkTagDialog(false);
                setBulkTagInput("");
                setBulkTagMode("manual");
            } catch (error) {
                console.error("Error auto-tagging media:", error);
            }
            return;
        }

        if (!bulkTagInput.trim()) return;

        const newTag = bulkTagInput.trim();

        try {
            // Update tags for all selected images
            const updatePromises = selectedMediaFileObjects
                .filter((image) => getSelectedMediaTaskId(image))
                .map(async (image) => {
                    const currentTags = image.tags || [];
                    const updatedTags = [...currentTags];

                    // Add the new tag if it doesn't already exist
                    if (!updatedTags.includes(newTag)) {
                        updatedTags.push(newTag);
                    }

                    return updateTagsMutation.mutateAsync({
                        taskId: getSelectedMediaTaskId(image),
                        tags: updatedTags,
                    });
                });

            await Promise.all(updatePromises);

            // Close dialog and clear input
            setShowBulkTagDialog(false);
            setBulkTagInput("");
            setBulkTagMode("manual");
        } catch (error) {
            console.error("Error updating tags:", error);
        }
    }, [
        autoTagMutation,
        bulkTagInput,
        bulkTagMode,
        selectedMediaFileObjects,
        updateTagsMutation,
    ]);

    return (
        <div
            className="flex h-full min-h-0 flex-col overflow-hidden overscroll-contain"
            dir={direction}
        >
            <div className="flex flex-shrink-0 flex-col gap-4">
                <div className="mb-3 sm:mb-4">
                    <form
                        ref={formRef}
                        className="flex flex-col gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (!canGenerate || loading) return;
                            setLoading(true);

                            // Check if we have selected images to use as input
                            if (selectedImageCount > 0) {
                                if (
                                    selectedReferencesForGeneration.length > 0
                                ) {
                                    handleCombineSelected();
                                } else {
                                    generateMedia(
                                        prompt,
                                        null,
                                        null,
                                        "",
                                        getGenerationSettings(),
                                        selectedAudioForInput,
                                    );
                                }
                            } else {
                                // No images selected, generate normally
                                generateMedia(
                                    prompt,
                                    null,
                                    null,
                                    "",
                                    getGenerationSettings(),
                                    selectedAudioForInput,
                                );
                            }
                        }}
                    >
                        {/* Container with border for prompt box and thin bar */}
                        <div className="rounded-lg border border-gray-300 p-2.5 dark:border-gray-600 sm:rounded-xl sm:p-3">
                            {/* Flex container for textarea and button */}
                            <div className="flex items-start gap-2">
                                <div className="flex-1">
                                    <AutosizeTextarea
                                        className="min-h-[2.25rem] w-full resize-y border-none bg-transparent p-0 ps-1 pt-0.5 text-start text-base outline-none focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent sm:min-h-[2.5rem]"
                                        maxHeight={160}
                                        minHeight={36}
                                        placeholder={
                                            selectedImages.size > 0
                                                ? t(
                                                      "Describe what you want to do with the selected media",
                                                  )
                                                : selectedModelType === "tts"
                                                  ? t(
                                                        "Enter the words to synthesize, plus any voice direction",
                                                    )
                                                  : selectedModelType ===
                                                      "audio"
                                                    ? t(
                                                          "Describe the music, sound design, or audio idea",
                                                      )
                                                    : t(
                                                          "Describe what you want to generate",
                                                      )
                                        }
                                        value={prompt}
                                        onChange={(e) =>
                                            setPrompt(e.target.value)
                                        }
                                        onKeyDown={(e) => {
                                            if (
                                                e.key === "Enter" &&
                                                !e.shiftKey
                                            ) {
                                                e.preventDefault();
                                                if (!loading && canGenerate) {
                                                    formRef.current?.requestSubmit();
                                                }
                                            }
                                        }}
                                        ref={promptRef}
                                    />
                                    {showLyricsInput && (
                                        <div className="mt-2 border-t border-gray-200 pt-2 dark:border-gray-700">
                                            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                                                <Music className="h-3.5 w-3.5" />
                                                <span>{t("Lyrics")}</span>
                                            </label>
                                            <AutosizeTextarea
                                                className="w-full resize-y border-none bg-transparent p-0 ps-1 text-start text-sm outline-none focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"
                                                maxHeight={160}
                                                minHeight={40}
                                                placeholder={t(
                                                    "Optional lyrics for this track",
                                                )}
                                                value={currentLyrics}
                                                onChange={(e) =>
                                                    updateCurrentLyrics(
                                                        e.target.value,
                                                    )
                                                }
                                            />
                                        </div>
                                    )}
                                    {currentStructuredMediaControls.length >
                                        0 && (
                                        <div className="media-structured-inputs">
                                            {currentStructuredMediaControls.map(
                                                (control) => (
                                                    <TextMediaControl
                                                        key={control.key}
                                                        label={t(
                                                            control.label ||
                                                                control.key,
                                                        )}
                                                        value={getCurrentSettingValue(
                                                            control.key,
                                                            selectedModelMeta
                                                                ?.mediaDefaults?.[
                                                                control.key
                                                            ] || "",
                                                        )}
                                                        placeholder={
                                                            control.placeholder
                                                                ? t(
                                                                      control.placeholder,
                                                                  )
                                                                : ""
                                                        }
                                                        onChange={(nextValue) =>
                                                            updateCurrentModelSetting(
                                                                control.key,
                                                                nextValue,
                                                            )
                                                        }
                                                    />
                                                ),
                                            )}
                                        </div>
                                    )}
                                </div>
                                {/* Selected images thumbnails - hidden on mobile */}
                                {selectedReferenceCount > 0 && (
                                    <div className="hidden md:flex items-start gap-1.5 flex-shrink-0">
                                        {selectedReferenceObjectsForDisplay
                                            .slice(0, 3) // Show max 3 thumbnails
                                            .map((image, index) => {
                                                const imageUrl =
                                                    getSelectedMediaUrl(image);
                                                const role =
                                                    getSelectedImageRole(
                                                        image,
                                                        index,
                                                    );
                                                const referenceError =
                                                    getSelectedReferenceError(
                                                        image,
                                                        index,
                                                    );
                                                if (
                                                    !imageUrl ||
                                                    imageUrl === "null" ||
                                                    imageUrl === "undefined"
                                                )
                                                    return null;

                                                return (
                                                    <button
                                                        type="button"
                                                        key={
                                                            image.cortexRequestId
                                                        }
                                                        className={`media-selected-reference-thumb compact ${
                                                            referenceError
                                                                ? "invalid"
                                                                : ""
                                                        }`}
                                                        title={
                                                            referenceError ||
                                                            undefined
                                                        }
                                                        aria-label={
                                                            referenceError ||
                                                            t(
                                                                "Selected References",
                                                            )
                                                        }
                                                        onClick={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            openImageReferenceDetails();
                                                        }}
                                                    >
                                                        <SelectedReferenceThumbnail
                                                            media={image}
                                                            className="w-full h-full object-cover"
                                                        />
                                                        {referenceError && (
                                                            <span
                                                                className="media-selected-reference-error"
                                                                aria-hidden="true"
                                                            >
                                                                <span className="media-selected-reference-error-text">
                                                                    {
                                                                        referenceError
                                                                    }
                                                                </span>
                                                            </span>
                                                        )}
                                                        {role && (
                                                            <ReferenceImageRoleBadge
                                                                role={role}
                                                                label={getReferenceImageRoleLabel(
                                                                    role,
                                                                    t,
                                                                )}
                                                                className="media-selected-reference-role"
                                                            />
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        {selectedReferenceCount > 3 && (
                                            <div className="flex items-center justify-center w-10 h-10 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400">
                                                +{selectedReferenceCount - 3}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {/* Generate button */}
                                <div className="flex items-start flex-shrink-0">
                                    <button
                                        type="submit"
                                        className="flex h-10 w-10 cursor-pointer items-center justify-center gap-1 rounded-lg border-none bg-sky-600 p-1.5 px-3 py-2 text-sm text-white outline-none enabled:hover:bg-sky-700 enabled:active:bg-sky-800 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-700 dark:enabled:hover:bg-sky-800 dark:enabled:hover:text-white dark:enabled:active:bg-sky-900 md:w-[110px]"
                                        disabled={!canGenerate || loading}
                                        title={
                                            generationValidationMessage ||
                                            undefined
                                        }
                                    >
                                        {loading ? (
                                            <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                                        ) : (
                                            <Sparkles className="h-4 w-4 flex-shrink-0" />
                                        )}
                                        <span className="hidden md:block whitespace-nowrap">
                                            {loading
                                                ? t("Generating")
                                                : t("Generate")}
                                        </span>
                                    </button>
                                </div>
                            </div>

                            {/* Thin bar with model selector and settings */}
                            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                                {/* Model selector and optimize prompt button - always on same line */}
                                <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                                    {/* Model selector */}
                                    {(() => {
                                        const availableModels =
                                            getAvailableModels();

                                        const getCurrentDisplayName = () => {
                                            const currentDisplayName =
                                                getDisplayName(selectedModel);
                                            const modelSettings =
                                                getModelSettings(
                                                    settings,
                                                    selectedModel,
                                                    mediaModels,
                                                );
                                            const icon = getMediaTypeIcon(
                                                modelSettings.type,
                                            );
                                            return `${icon} ${currentDisplayName}`;
                                        };

                                        const modelGroups = [
                                            {
                                                key: "image",
                                                title: t("Image"),
                                                symbol: "🖼️",
                                                models: availableModels.image,
                                            },
                                            {
                                                key: "video",
                                                title: t("Video"),
                                                symbol: "🎬",
                                                models: availableModels.video,
                                            },
                                            {
                                                key: "audio",
                                                title: t("Music"),
                                                symbol: "🎵",
                                                models: availableModels.audio,
                                            },
                                            {
                                                key: "tts",
                                                title: t("Speech"),
                                                symbol: "🗣️",
                                                models: availableModels.tts,
                                            },
                                        ];
                                        const handleModelSelect = (
                                            newSelectedModel,
                                        ) => {
                                            const modelSettings =
                                                getModelSettings(
                                                    settings,
                                                    newSelectedModel,
                                                    mediaModels,
                                                );

                                            setSelectedModel(newSelectedModel);

                                            if (
                                                modelSettings.type === "image"
                                            ) {
                                                setQuality(
                                                    modelSettings.quality ||
                                                        "draft",
                                                );
                                            }
                                            setOutputType(
                                                modelSettings.type || "image",
                                            );
                                            setIsModelSelectOpen(false);
                                        };

                                        return (
                                            <Select
                                                value={selectedModel}
                                                open={isModelSelectOpen}
                                                onOpenChange={
                                                    setIsModelSelectOpen
                                                }
                                                onValueChange={
                                                    handleModelSelect
                                                }
                                            >
                                                <SelectTrigger
                                                    ref={modelSelectorRef}
                                                    className="h-auto max-w-[min(11.5rem,58vw)] cursor-pointer border-none bg-transparent py-1 ps-1 pe-1.5 text-sm text-gray-700 shadow-none outline-none hover:opacity-80 focus:ring-0 focus:ring-offset-0 dark:text-gray-300 sm:max-w-[200px] sm:pe-2"
                                                    dir={direction}
                                                >
                                                    <SelectValue>
                                                        {getCurrentDisplayName()}
                                                    </SelectValue>
                                                </SelectTrigger>
                                                <MediaModelSelectContent
                                                    direction={direction}
                                                    modelGroups={modelGroups}
                                                    getDisplayName={
                                                        getDisplayName
                                                    }
                                                    getModelMeta={(modelName) =>
                                                        modelMap.get(modelName)
                                                    }
                                                    onModelSelect={
                                                        handleModelSelect
                                                    }
                                                    emptyLabel={t("No models")}
                                                    onClose={() =>
                                                        setIsModelSelectOpen(
                                                            false,
                                                        )
                                                    }
                                                />
                                            </Select>
                                        );
                                    })()}
                                    {/* Optimize prompt button - after model selector */}
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    type="button"
                                                    onClick={handlePromptAssist}
                                                    disabled={
                                                        isOptimizing || loading
                                                    }
                                                    aria-label={
                                                        promptAssistLabel
                                                    }
                                                    className={
                                                        promptAssistClassName
                                                    }
                                                >
                                                    {isOptimizing ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <PromptAssistIcon className="h-4 w-4" />
                                                    )}
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                {promptAssistLabel}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>

                                {hasCurrentOutputSettings && (
                                    <div className="flex items-center gap-1">
                                        {/* Settings button */}
                                        <TooltipProvider>
                                            <Tooltip
                                                open={
                                                    disableTooltip
                                                        ? false
                                                        : undefined
                                                }
                                            >
                                                <TooltipTrigger asChild>
                                                    <button
                                                        type="button"
                                                        className="cursor-pointer border-none bg-transparent p-1 text-gray-500 outline-none hover:text-gray-700 hover:opacity-80 focus:outline-none dark:text-gray-400 dark:hover:text-gray-200"
                                                        onClick={() =>
                                                            setShowSettings(
                                                                true,
                                                            )
                                                        }
                                                    >
                                                        <Settings className="h-4 w-4" />
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    {t("Generation Settings")}
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>
                                )}

                                {/* Model settings display and image context badge */}
                                <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-gray-500 dark:text-gray-400 sm:gap-1.5">
                                    {getAvailableAspectRatios(selectedModel)
                                        .length > 0 &&
                                        getCurrentSettingValue(
                                            "aspectRatio",
                                        ) && (
                                            <InlineSettingPicker
                                                label={t("Aspect Ratio")}
                                                value={getCurrentSettingValue(
                                                    "aspectRatio",
                                                )}
                                                displayValue={
                                                    getCurrentSettingValue(
                                                        "aspectRatio",
                                                    ) === "match_input_image"
                                                        ? t("Match Input")
                                                        : getCurrentSettingValue(
                                                              "aspectRatio",
                                                          )
                                                }
                                                options={getAvailableAspectRatios(
                                                    selectedModel,
                                                )}
                                                onSelect={(value) =>
                                                    updateCurrentModelSetting(
                                                        "aspectRatio",
                                                        value,
                                                    )
                                                }
                                            />
                                        )}
                                    {selectedModelMeta?.availableImageSizes
                                        ?.length > 0 &&
                                        getCurrentSettingValue(
                                            ["image_size", "imageSize", "size"],
                                            "2K",
                                        ) && (
                                            <InlineSettingPicker
                                                label={t("Image Size")}
                                                value={getCurrentSettingValue(
                                                    [
                                                        "image_size",
                                                        "imageSize",
                                                        "size",
                                                    ],
                                                    "2K",
                                                )}
                                                options={selectedModelMeta.availableImageSizes.map(
                                                    (size) => ({
                                                        value: size,
                                                        label: size,
                                                    }),
                                                )}
                                                onSelect={(value) =>
                                                    updateCurrentModelSetting(
                                                        "image_size",
                                                        value,
                                                    )
                                                }
                                            />
                                        )}
                                    {selectedModelType === "video" && (
                                        <>
                                            {getAvailableDurations(
                                                selectedModel,
                                            ).length > 0 &&
                                                getCurrentSettingValue(
                                                    "duration",
                                                ) && (
                                                    <InlineSettingPicker
                                                        label={t("Duration")}
                                                        value={getCurrentSettingValue(
                                                            "duration",
                                                        )}
                                                        displayValue={`${getCurrentSettingValue(
                                                            "duration",
                                                        )}s`}
                                                        options={getAvailableDurations(
                                                            selectedModel,
                                                        )}
                                                        onSelect={(value) =>
                                                            updateCurrentModelSetting(
                                                                "duration",
                                                                value,
                                                            )
                                                        }
                                                    />
                                                )}
                                            {selectedModelMeta
                                                ?.availableResolutions?.length >
                                                0 &&
                                                getCurrentSettingValue(
                                                    "resolution",
                                                ) && (
                                                    <InlineSettingPicker
                                                        label={t("Resolution")}
                                                        value={getCurrentSettingValue(
                                                            "resolution",
                                                        )}
                                                        options={selectedModelMeta.availableResolutions.map(
                                                            (resolution) => ({
                                                                value: resolution,
                                                                label: resolution,
                                                            }),
                                                        )}
                                                        onSelect={(value) =>
                                                            updateCurrentModelSetting(
                                                                "resolution",
                                                                value,
                                                            )
                                                        }
                                                    />
                                                )}
                                            {selectedModelMeta?.mediaToggles?.includes(
                                                "generateAudio",
                                            ) &&
                                                currentModelSettings.generateAudio !==
                                                    undefined && (
                                                    <InlineSettingPicker
                                                        label={t(
                                                            "Generate Audio",
                                                        )}
                                                        value={Boolean(
                                                            getCurrentSettingValue(
                                                                "generateAudio",
                                                                false,
                                                            ),
                                                        )}
                                                        displayValue={
                                                            getCurrentSettingValue(
                                                                "generateAudio",
                                                                false,
                                                            )
                                                                ? t("Audio")
                                                                : t("No Audio")
                                                        }
                                                        options={[
                                                            {
                                                                value: true,
                                                                label: t(
                                                                    "Audio",
                                                                ),
                                                            },
                                                            {
                                                                value: false,
                                                                label: t(
                                                                    "No Audio",
                                                                ),
                                                            },
                                                        ]}
                                                        onSelect={(value) =>
                                                            updateCurrentModelSetting(
                                                                "generateAudio",
                                                                value,
                                                            )
                                                        }
                                                    />
                                                )}
                                            {selectedModelMeta?.mediaToggles?.includes(
                                                "cameraFixed",
                                            ) && (
                                                <InlineSettingPicker
                                                    label={t("Camera")}
                                                    value={Boolean(
                                                        getCurrentSettingValue(
                                                            "cameraFixed",
                                                            false,
                                                        ),
                                                    )}
                                                    displayValue={
                                                        getCurrentSettingValue(
                                                            "cameraFixed",
                                                            false,
                                                        )
                                                            ? t("Fixed Camera")
                                                            : t("Free Camera")
                                                    }
                                                    options={[
                                                        {
                                                            value: true,
                                                            label: t(
                                                                "Fixed Camera",
                                                            ),
                                                        },
                                                        {
                                                            value: false,
                                                            label: t(
                                                                "Free Camera",
                                                            ),
                                                        },
                                                    ]}
                                                    onSelect={(value) =>
                                                        updateCurrentModelSetting(
                                                            "cameraFixed",
                                                            value,
                                                        )
                                                    }
                                                />
                                            )}
                                        </>
                                    )}
                                    {selectedModelMeta?.mediaToggles?.includes(
                                        "optimizePrompt",
                                    ) && (
                                        <InlineSettingPicker
                                            label={t("Optimize Prompt")}
                                            value={
                                                getCurrentSettingValue(
                                                    "optimizePrompt",
                                                    true,
                                                ) !== false
                                            }
                                            displayValue={
                                                getCurrentSettingValue(
                                                    "optimizePrompt",
                                                    true,
                                                ) !== false
                                                    ? t("Optimized")
                                                    : t("Raw Prompt")
                                            }
                                            options={[
                                                {
                                                    value: true,
                                                    label: t("Optimized"),
                                                },
                                                {
                                                    value: false,
                                                    label: t("Raw Prompt"),
                                                },
                                            ]}
                                            onSelect={(value) =>
                                                updateCurrentModelSetting(
                                                    "optimizePrompt",
                                                    value,
                                                )
                                            }
                                        />
                                    )}
                                    {currentCompactMediaControls.map(
                                        (control) => {
                                            const value =
                                                getCurrentSettingValue(
                                                    control.key,
                                                    selectedModelMeta
                                                        ?.mediaDefaults?.[
                                                        control.key
                                                    ],
                                                );
                                            if (
                                                value === undefined ||
                                                value === null
                                            ) {
                                                return null;
                                            }
                                            if (
                                                isNumericMediaControl(control)
                                            ) {
                                                return (
                                                    <InlineNumberSetting
                                                        key={control.key}
                                                        label={t(
                                                            control.label ||
                                                                control.key,
                                                        )}
                                                        value={value}
                                                        control={control}
                                                        onChange={(nextValue) =>
                                                            updateCurrentModelSetting(
                                                                control.key,
                                                                nextValue,
                                                            )
                                                        }
                                                    />
                                                );
                                            }
                                            return (
                                                <InlineSettingPicker
                                                    key={control.key}
                                                    label={t(
                                                        control.label ||
                                                            control.key,
                                                    )}
                                                    value={value}
                                                    displayValue={getMediaControlDisplayValue(
                                                        value,
                                                        control.options,
                                                        control,
                                                    )}
                                                    options={control.options}
                                                    onSelect={(nextValue) =>
                                                        updateCurrentModelSetting(
                                                            control.key,
                                                            nextValue,
                                                        )
                                                    }
                                                />
                                            );
                                        },
                                    )}
                                </div>
                                <div className="flex flex-wrap justify-end gap-1 text-xs sm:ms-auto">
                                    {/* Reference status badge */}
                                    {selectedReferenceCount > 0 ? (
                                        <Popover
                                            open={isImageReferenceDetailsOpen}
                                            onOpenChange={
                                                setIsImageReferenceDetailsOpen
                                            }
                                        >
                                            <PopoverTrigger asChild>
                                                <button
                                                    type="button"
                                                    className={
                                                        selectedModelReferenceMessage
                                                            ? "rounded-md bg-amber-100 px-2 py-0.5 text-amber-700 hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 dark:bg-amber-900 dark:text-amber-300 dark:hover:bg-amber-800 dark:focus:ring-amber-400 dark:focus:ring-offset-gray-900"
                                                            : "rounded-md bg-sky-100 px-2 py-0.5 text-sky-700 hover:bg-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 dark:bg-sky-900 dark:text-sky-300 dark:hover:bg-sky-800 dark:focus:ring-sky-400 dark:focus:ring-offset-gray-900"
                                                    }
                                                    aria-label={
                                                        selectedModelReferenceMessage ||
                                                        t("Selected References")
                                                    }
                                                    title={
                                                        selectedModelReferenceMessage ||
                                                        undefined
                                                    }
                                                >
                                                    {selectedModelReferenceMessage ||
                                                        `${selectedReferenceCount} ${
                                                            selectedReferenceCount ===
                                                            1
                                                                ? t("reference")
                                                                : t(
                                                                      "references",
                                                                  )
                                                        }`}
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-3">
                                                <div className="text-xs font-medium mb-2 text-gray-700 dark:text-gray-300">
                                                    {t("Selected References")}
                                                </div>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-md">
                                                    {selectedReferenceObjectsForDisplay.map(
                                                        (image, index) => {
                                                            const imageUrl =
                                                                getSelectedMediaUrl(
                                                                    image,
                                                                );
                                                            const role =
                                                                getSelectedImageRole(
                                                                    image,
                                                                    index,
                                                                );
                                                            const roleOptions =
                                                                getSelectedReferenceRoleOptions(
                                                                    image,
                                                                );
                                                            const referenceError =
                                                                getSelectedReferenceError(
                                                                    image,
                                                                    index,
                                                                );
                                                            const displayName =
                                                                getSelectedMediaDisplayName(
                                                                    image,
                                                                );
                                                            const referenceTitle =
                                                                [
                                                                    displayName,
                                                                    referenceError,
                                                                ]
                                                                    .filter(
                                                                        Boolean,
                                                                    )
                                                                    .join(
                                                                        "\n",
                                                                    ) ||
                                                                undefined;
                                                            if (
                                                                !imageUrl ||
                                                                imageUrl ===
                                                                    "null" ||
                                                                imageUrl ===
                                                                    "undefined"
                                                            )
                                                                return null;

                                                            return (
                                                                <div
                                                                    key={
                                                                        getSelectedMediaId(
                                                                            image,
                                                                        ) ||
                                                                        index
                                                                    }
                                                                    className="media-selected-reference"
                                                                >
                                                                    <div
                                                                        className={`media-selected-reference-thumb ${
                                                                            referenceError
                                                                                ? "invalid"
                                                                                : ""
                                                                        }`}
                                                                        title={
                                                                            referenceTitle
                                                                        }
                                                                        aria-label={
                                                                            referenceError ||
                                                                            displayName ||
                                                                            undefined
                                                                        }
                                                                    >
                                                                        <SelectedReferenceThumbnail
                                                                            media={
                                                                                image
                                                                            }
                                                                            className="w-full h-full object-cover"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            className="media-selected-reference-remove"
                                                                            aria-label={t(
                                                                                "Remove",
                                                                            )}
                                                                            title={t(
                                                                                "Remove",
                                                                            )}
                                                                            onClick={(
                                                                                event,
                                                                            ) => {
                                                                                event.preventDefault();
                                                                                event.stopPropagation();
                                                                                handleRemoveSelectedReference(
                                                                                    image,
                                                                                );
                                                                            }}
                                                                        >
                                                                            <X className="h-3.5 w-3.5" />
                                                                        </button>
                                                                        {displayName && (
                                                                            <span className="media-selected-reference-name">
                                                                                {
                                                                                    displayName
                                                                                }
                                                                            </span>
                                                                        )}
                                                                        {referenceError && (
                                                                            <span
                                                                                className="media-selected-reference-error"
                                                                                aria-hidden="true"
                                                                            >
                                                                                <span className="media-selected-reference-error-text">
                                                                                    {
                                                                                        referenceError
                                                                                    }
                                                                                </span>
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {roleOptions.length >
                                                                        0 &&
                                                                        role && (
                                                                            <div className="media-selected-reference-controls">
                                                                                {roleOptions.map(
                                                                                    (
                                                                                        option,
                                                                                    ) => (
                                                                                        <button
                                                                                            key={
                                                                                                option.value
                                                                                            }
                                                                                            type="button"
                                                                                            className={`media-selected-reference-role-option ${
                                                                                                role ===
                                                                                                option.value
                                                                                                    ? "selected"
                                                                                                    : ""
                                                                                            }`}
                                                                                            onClick={(
                                                                                                event,
                                                                                            ) => {
                                                                                                event.preventDefault();
                                                                                                event.stopPropagation();
                                                                                                handleSelectedImageRoleChange(
                                                                                                    image,
                                                                                                    option.value,
                                                                                                );
                                                                                            }}
                                                                                        >
                                                                                            {
                                                                                                option.label
                                                                                            }
                                                                                        </button>
                                                                                    ),
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                </div>
                                                            );
                                                        },
                                                    )}
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                    ) : selectedModelReferenceMessage ? (
                                        <span
                                            className="rounded-md bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                                            title={
                                                selectedModelReferenceMessage
                                            }
                                        >
                                            {selectedModelReferenceMessage}
                                        </span>
                                    ) : null}
                                    {voiceDesignDescriptionMessage && (
                                        <span
                                            className="rounded-md bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                                            title={
                                                voiceDesignDescriptionMessage
                                            }
                                        >
                                            {voiceDesignDescriptionMessage}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            <input
                ref={mediaUploadInputRef}
                type="file"
                className="hidden"
                accept="image/*,audio/*,video/*"
                multiple
                onChange={handleFileSelect}
                disabled={isUploading}
            />

            <div className="min-h-0 flex-1 overflow-hidden">
                {mediaItemsLoading || isMigrationInProgress ? (
                    <div className="flex h-full items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                        <span className="ms-2 text-gray-500">
                            {isMigrationInProgress
                                ? t("Migrating media from localStorage...")
                                : t("Loading media...")}
                        </span>
                    </div>
                ) : (
                    <UnifiedFileManager
                        contextId={user?.contextId}
                        storageTarget={mediaStorageTarget}
                        augmentedFiles={mediaFileItems}
                        defaultSelectedPath=""
                        rootFolderLabel="media"
                        moveTargetBasePath="media"
                        filterFile={filterMediaExplorerFile}
                        onFolderChange={handleMediaFolderChange}
                        defaultViewMode="grid"
                        onSelectionChange={handleUnifiedSelectionChange}
                        onDelete={handleUnifiedDelete}
                        onMove={handleUnifiedMove}
                        onUpdateMetadata={handleUnifiedRename}
                        onDownload={handleDownload}
                        isDownloading={isDownloading}
                        onAttach={handleAddSelectedFilesAsReferences}
                        getBulkActionVisibility={getMediaBulkActionVisibility}
                        onUploadClick={() =>
                            mediaUploadInputRef.current?.click()
                        }
                        extraBulkActions={({ selectedObjects }) => ({
                            ...(selectedObjects.some(isFailedMediaFile)
                                ? {}
                                : {
                                      tag: {
                                          onClick: () =>
                                              setShowBulkTagDialog(true),
                                          disabled:
                                              selectedObjects.length === 0,
                                          label: t("Add Tag"),
                                          ariaLabel: `${t("Add Tag")} (${selectedObjects.length})`,
                                      },
                                  }),
                        })}
                        renderFileOverlay={renderMediaFileOverlay}
                        renderFileStatus={renderMediaFileStatus}
                        renderPreviewDialog={renderMediaPreviewDialog}
                        containerHeight="100%"
                    />
                )}
            </div>

            <SettingsDialog
                show={showSettings}
                settings={settings}
                setSettings={setSettingsAndRef}
                setSelectedModel={setSelectedModel}
                setOutputType={setOutputType}
                setQuality={setQuality}
                onHide={() => setShowSettings(false)}
                debouncedUpdateUserState={debouncedUpdateUserState}
                userState={userState}
                currentSelectedModel={selectedModel}
            />

            <AlertDialog
                open={showDownloadError}
                onOpenChange={setShowDownloadError}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("Download limit exceeded")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {downloadError}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction
                            onClick={() => setShowDownloadError(false)}
                        >
                            {t("OK")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Bulk Tag Dialog */}
            <Modal
                show={showBulkTagDialog}
                onHide={() => {
                    setShowBulkTagDialog(false);
                    setBulkTagInput("");
                    setBulkTagMode("manual");
                }}
                title={t("Add Tag to Selected Media")}
                initialFocus={bulkTagInputRef}
            >
                <div className="space-y-4">
                    <div
                        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                        role="radiogroup"
                        aria-label={t("Tagging mode")}
                    >
                        <button
                            type="button"
                            role="radio"
                            aria-checked={bulkTagMode === "manual"}
                            className={`flex min-h-11 items-center gap-2 rounded border px-3 py-2 text-start text-sm transition ${
                                bulkTagMode === "manual"
                                    ? "border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-400 dark:bg-sky-950/40 dark:text-sky-200"
                                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                            }`}
                            onClick={() => setBulkTagMode("manual")}
                        >
                            <Tag className="h-4 w-4 flex-shrink-0" />
                            <span>{t("Enter Tag Manually")}</span>
                        </button>
                        <button
                            type="button"
                            role="radio"
                            aria-checked={bulkTagMode === "auto"}
                            className={`flex min-h-11 items-center gap-2 rounded border px-3 py-2 text-start text-sm transition ${
                                bulkTagMode === "auto"
                                    ? "border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-400 dark:bg-sky-950/40 dark:text-sky-200"
                                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                            }`}
                            onClick={() => setBulkTagMode("auto")}
                        >
                            <Sparkles className="h-4 w-4 flex-shrink-0" />
                            <span>{t("Auto Tag")}</span>
                        </button>
                    </div>
                    {bulkTagMode === "manual" ? (
                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                                {t("Tag")}
                            </label>
                            <input
                                type="text"
                                className="lb-input w-full"
                                placeholder={t("Enter tag name...")}
                                value={bulkTagInput}
                                onChange={(e) =>
                                    setBulkTagInput(e.target.value)
                                }
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleBulkTag();
                                    }
                                }}
                                ref={bulkTagInputRef}
                            />
                        </div>
                    ) : null}
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                        {bulkTagMode === "auto"
                            ? t(
                                  "Auto-tagging will run separately for {{count}} selected media items",
                                  {
                                      count: selectedMediaFileIds.size,
                                  },
                              )
                            : t(
                                  "This tag will be added to {{count}} selected media items",
                                  {
                                      count: selectedMediaFileIds.size,
                                  },
                              )}
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                            onClick={() => {
                                setShowBulkTagDialog(false);
                                setBulkTagInput("");
                                setBulkTagMode("manual");
                            }}
                        >
                            {t("Cancel")}
                        </button>
                        <button
                            className="px-4 py-2 text-sm bg-sky-500 text-white rounded hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            onClick={handleBulkTag}
                            disabled={
                                (bulkTagMode === "manual" &&
                                    !bulkTagInput.trim()) ||
                                updateTagsMutation.isPending ||
                                autoTagMutation.isPending
                            }
                        >
                            {updateTagsMutation.isPending ||
                            autoTagMutation.isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {bulkTagMode === "auto"
                                        ? t("Auto-tagging...")
                                        : t("Adding...")}
                                </>
                            ) : bulkTagMode === "auto" ? (
                                <>
                                    <Sparkles className="h-4 w-4" />
                                    {t("Auto Tag")}
                                </>
                            ) : (
                                <>
                                    <Tag className="h-4 w-4" />
                                    {t("Add Tag")}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

function SettingsDialog({
    show,
    settings,
    setSettings,
    setSelectedModel: setParentSelectedModel,
    setOutputType,
    setQuality,
    onHide,
    debouncedUpdateUserState,
    userState,
    currentSelectedModel,
}) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const { data: mediaModels } = useMediaModels();
    const [localSettings, setLocalSettings] = useState(settings);
    const [hasLocalChanges, setHasLocalChanges] = useState(false);
    const defaultModelId =
        mediaModels?.find((m) => m.category === "image" && m.isDefault)
            ?.modelId || "";
    const [selectedModel, setSelectedModel] = useState(
        currentSelectedModel || defaultModelId,
    );
    const [isModelSelectOpen, setIsModelSelectOpen] = useState(false);
    const initializedRef = useRef(false);
    const wasOpenRef = useRef(false);
    const hasLocalChangesRef = useRef(false);

    // Initialize localSettings and selectedModel when dialog opens
    useEffect(() => {
        if (show && !wasOpenRef.current) {
            hasLocalChangesRef.current = false;
            setLocalSettings(settings);
            setHasLocalChanges(false);
            // Set the selected model to the current one from the main component
            if (currentSelectedModel) {
                setSelectedModel(currentSelectedModel);
            }
            initializedRef.current = true;
        } else if (show && !hasLocalChangesRef.current) {
            // Allow late user-state/model metadata hydration to populate the
            // dialog until the user starts editing. After that, keep local
            // edits isolated so a parent settings refresh cannot reset them.
            setLocalSettings(settings);
        } else if (!show) {
            initializedRef.current = false;
            hasLocalChangesRef.current = false;
            setHasLocalChanges(false);
        }
        wasOpenRef.current = show;
    }, [show, settings, currentSelectedModel, hasLocalChanges]);

    const handleSave = () => {
        const sanitizedLocalSettings = sanitizeMediaSettings(localSettings);

        // Update local settings state immediately
        setSettings(sanitizedLocalSettings);

        if (selectedModel) {
            setParentSelectedModel(selectedModel);
            const selectedModelSettings =
                sanitizedLocalSettings.models?.[selectedModel];
            const selectedModelType =
                selectedModelSettings?.type ||
                modelMap.get(selectedModel)?.category ||
                "image";

            setOutputType(selectedModelType);
            if (selectedModelType === "image") {
                setQuality(selectedModelSettings?.quality || "draft");
            }
        }

        // Save settings to user state (debounced for server persistence)
        debouncedUpdateUserState({
            media: {
                ...userState?.media,
                settings: sanitizedLocalSettings,
            },
        });

        onHide();
    };

    const handleCancel = () => {
        // Don't update localSettings on cancel - just close the dialog
        onHide();
    };

    const updateModelSetting = (modelName, key, value) => {
        hasLocalChangesRef.current = true;
        setHasLocalChanges(true);
        setLocalSettings((prev) => ({
            ...prev,
            models: {
                ...(prev.models || {}),
                [modelName]: {
                    ...(prev.models?.[modelName] || {}),
                    [key]: value,
                    ...(key === "image_size"
                        ? { imageSize: value, size: value }
                        : {}),
                },
            },
        }));
    };

    // Build a lookup map for O(1) model metadata access
    const modelMap = useMemo(() => {
        if (!mediaModels) return new Map();
        return new Map(mediaModels.map((m) => [m.modelId, m]));
    }, [mediaModels]);

    const selectedModelMeta = modelMap.get(selectedModel);

    const getModelDisplayName = (modelName) => {
        return t(modelMap.get(modelName)?.displayName || modelName);
    };

    const getModelType = (modelName) => {
        if (localSettings.models[modelName]?.type)
            return localSettings.models[modelName].type;
        return modelMap.get(modelName)?.category || "image";
    };

    const getAvailableAspectRatios = (modelName) => {
        const ratios = modelMap.get(modelName)?.availableAspectRatios;
        if (ratios) {
            return ratios.map((v) => ({
                value: v,
                label: v === "match_input_image" ? t("Match Input Image") : v,
            }));
        }
        return [];
    };

    const getAvailableDurations = (modelName) => {
        const durations = modelMap.get(modelName)?.availableDurations;
        if (durations) {
            return durations.map((v) => ({
                value: v,
                label: `${v}s`,
            }));
        }
        return [];
    };

    // Group and sort models for SettingsDialog
    const allModelNames = Object.keys(localSettings.models || {});
    const imageModels = allModelNames
        .filter(
            (name) => (localSettings.models[name]?.type || "image") === "image",
        )
        .sort();
    const videoModels = allModelNames
        .filter(
            (name) => (localSettings.models[name]?.type || "image") === "video",
        )
        .sort();
    const audioModels = allModelNames
        .filter(
            (name) => (localSettings.models[name]?.type || "image") === "audio",
        )
        .sort();
    const ttsModels = allModelNames
        .filter(
            (name) => (localSettings.models[name]?.type || "image") === "tts",
        )
        .sort();
    const currentModelSettings = localSettings.models?.[selectedModel] || {};
    const selectedModelType = getModelType(selectedModel);
    const selectedDisplayName = getModelDisplayName(selectedModel);
    const selectedProviderInfo = getModelProviderInfo(
        selectedModelMeta,
        selectedModel,
        selectedDisplayName,
    );
    const aspectRatioOptions = getAvailableAspectRatios(selectedModel);
    const durationOptions = getAvailableDurations(selectedModel);
    const imageSizeOptions =
        selectedModelMeta?.availableImageSizes?.map((size) => ({
            value: size,
            label: size,
        })) || [];
    const resolutionOptions =
        selectedModelMeta?.availableResolutions?.map((resolution) => ({
            value: resolution,
            label: resolution,
        })) || [];
    const mediaControls = getAugmentedMediaControls(
        selectedModelMeta,
        t,
        currentModelSettings,
    );
    const structuredMediaControls = mediaControls.filter(isTextMediaControl);
    const compactMediaControls = mediaControls.filter(
        (control) => !isTextMediaControl(control),
    );
    const showAspectRatioSetting =
        selectedModelType !== "audio" &&
        selectedModelType !== "tts" &&
        aspectRatioOptions.length > 0;
    const showImageSizeSetting = imageSizeOptions.length > 0;
    const showDurationSetting =
        selectedModelType === "video" && durationOptions.length > 0;
    const showResolutionSetting = resolutionOptions.length > 0;
    const showGenerateAudioSetting =
        selectedModelMeta?.mediaToggles?.includes("generateAudio");
    const showCameraFixedSetting =
        selectedModelMeta?.mediaToggles?.includes("cameraFixed");
    const showOptimizePromptSetting =
        selectedModelMeta?.mediaToggles?.includes("optimizePrompt");
    const hasOutputSettings =
        showAspectRatioSetting ||
        showImageSizeSetting ||
        showDurationSetting ||
        showResolutionSetting ||
        showGenerateAudioSetting ||
        showCameraFixedSetting ||
        showOptimizePromptSetting ||
        mediaControls.length > 0;
    const modelGroups = [
        {
            key: "image",
            title: t("Image"),
            symbol: "🖼️",
            models: imageModels,
        },
        {
            key: "video",
            title: t("Video"),
            symbol: "🎬",
            models: videoModels,
        },
        {
            key: "audio",
            title: t("Music"),
            symbol: "🎵",
            models: audioModels,
        },
        {
            key: "tts",
            title: t("Speech"),
            symbol: "🗣️",
            models: ttsModels,
        },
    ];
    const getSettingValue = (keys, fallback) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const key of keyList) {
            if (currentModelSettings?.[key] !== undefined) {
                return currentModelSettings[key];
            }
        }
        for (const key of keyList) {
            if (selectedModelMeta?.mediaDefaults?.[key] !== undefined) {
                return selectedModelMeta.mediaDefaults[key];
            }
        }
        return fallback;
    };

    return (
        <Modal
            show={show}
            onHide={handleCancel}
            title={t("Generation Settings")}
            widthClassName="max-w-3xl"
            closeOnOutside
            outsideClickIgnoreSelector=".media-model-select-content,[role='listbox']"
        >
            <div className="media-settings-shell">
                <div className="media-settings-dialog" dir={direction}>
                    <Select
                        value={selectedModel}
                        open={isModelSelectOpen}
                        onOpenChange={setIsModelSelectOpen}
                        onValueChange={(modelName) => {
                            setSelectedModel(modelName);
                            setIsModelSelectOpen(false);
                        }}
                    >
                        <SelectTrigger
                            className="media-settings-hero media-settings-model-trigger"
                            dir={direction}
                        >
                            <span className="media-settings-hero-icon">
                                {getMediaTypeIcon(selectedModelType)}
                            </span>
                            <span className="media-settings-hero-copy">
                                <span className="media-settings-kicker">
                                    {t("Active Model")}
                                </span>
                                <span className="media-settings-title">
                                    {selectedDisplayName}
                                </span>
                            </span>
                            <span
                                className="media-settings-provider"
                                title={selectedProviderInfo.label}
                                aria-label={selectedProviderInfo.label}
                            >
                                <MediaModelProviderIcon
                                    providerInfo={selectedProviderInfo}
                                />
                            </span>
                        </SelectTrigger>
                        <MediaModelSelectContent
                            direction={direction}
                            modelGroups={modelGroups}
                            getDisplayName={getModelDisplayName}
                            getModelMeta={(modelName) =>
                                modelMap.get(modelName)
                            }
                            onModelSelect={(modelName) => {
                                setSelectedModel(modelName);
                                setIsModelSelectOpen(false);
                            }}
                            emptyLabel={t("No models")}
                            onClose={() => setIsModelSelectOpen(false)}
                        />
                    </Select>

                    {hasOutputSettings && (
                        <div className="media-settings-panel">
                            <div className="media-settings-panel-header">
                                <span>{t("Output Settings")}</span>
                            </div>
                            <div className="media-settings-control-grid">
                                {showAspectRatioSetting && (
                                    <SettingsOptionGroup
                                        label={t("Aspect Ratio")}
                                        value={getSettingValue(
                                            "aspectRatio",
                                            "1:1",
                                        )}
                                        options={aspectRatioOptions}
                                        onSelect={(value) =>
                                            updateModelSetting(
                                                selectedModel,
                                                "aspectRatio",
                                                value,
                                            )
                                        }
                                    />
                                )}

                                {showImageSizeSetting && (
                                    <SettingsOptionGroup
                                        label={t("Image Size")}
                                        value={getSettingValue(
                                            ["image_size", "imageSize", "size"],
                                            "2K",
                                        )}
                                        options={imageSizeOptions}
                                        onSelect={(value) =>
                                            updateModelSetting(
                                                selectedModel,
                                                "image_size",
                                                value,
                                            )
                                        }
                                    />
                                )}

                                {showDurationSetting && (
                                    <SettingsOptionGroup
                                        label={t("Duration")}
                                        value={getSettingValue("duration", 5)}
                                        options={durationOptions}
                                        onSelect={(value) =>
                                            updateModelSetting(
                                                selectedModel,
                                                "duration",
                                                parseInt(value),
                                            )
                                        }
                                    />
                                )}

                                {showResolutionSetting && (
                                    <SettingsOptionGroup
                                        label={t("Resolution")}
                                        value={getSettingValue(
                                            "resolution",
                                            "1080p",
                                        )}
                                        options={resolutionOptions}
                                        onSelect={(value) =>
                                            updateModelSetting(
                                                selectedModel,
                                                "resolution",
                                                value,
                                            )
                                        }
                                    />
                                )}

                                {showGenerateAudioSetting && (
                                    <SettingsOptionGroup
                                        label={t("Generate Audio")}
                                        value={Boolean(
                                            getSettingValue(
                                                "generateAudio",
                                                false,
                                            ),
                                        )}
                                        options={[
                                            { value: true, label: t("Audio") },
                                            {
                                                value: false,
                                                label: t("No Audio"),
                                            },
                                        ]}
                                        onSelect={(value) =>
                                            updateModelSetting(
                                                selectedModel,
                                                "generateAudio",
                                                value,
                                            )
                                        }
                                    />
                                )}

                                {showCameraFixedSetting && (
                                    <SettingsOptionGroup
                                        label={t("Camera")}
                                        value={Boolean(
                                            getSettingValue(
                                                "cameraFixed",
                                                false,
                                            ),
                                        )}
                                        options={[
                                            {
                                                value: false,
                                                label: t("Free Camera"),
                                            },
                                            {
                                                value: true,
                                                label: t("Fixed Camera"),
                                            },
                                        ]}
                                        onSelect={(value) =>
                                            updateModelSetting(
                                                selectedModel,
                                                "cameraFixed",
                                                value,
                                            )
                                        }
                                    />
                                )}

                                {showOptimizePromptSetting && (
                                    <SettingsOptionGroup
                                        label={t("Optimize Prompt")}
                                        value={
                                            getSettingValue(
                                                "optimizePrompt",
                                                true,
                                            ) !== false
                                        }
                                        options={[
                                            {
                                                value: true,
                                                label: t("Optimized"),
                                            },
                                            {
                                                value: false,
                                                label: t("Raw Prompt"),
                                            },
                                        ]}
                                        onSelect={(value) =>
                                            updateModelSetting(
                                                selectedModel,
                                                "optimizePrompt",
                                                value,
                                            )
                                        }
                                    />
                                )}

                                {compactMediaControls.map((control) => {
                                    const value = getSettingValue(
                                        control.key,
                                        selectedModelMeta?.mediaDefaults?.[
                                            control.key
                                        ],
                                    );
                                    if (isNumericMediaControl(control)) {
                                        return (
                                            <NumericSettingsControl
                                                key={control.key}
                                                label={t(
                                                    control.label ||
                                                        control.key,
                                                )}
                                                value={value}
                                                control={control}
                                                onChange={(nextValue) =>
                                                    updateModelSetting(
                                                        selectedModel,
                                                        control.key,
                                                        nextValue,
                                                    )
                                                }
                                            />
                                        );
                                    }
                                    return (
                                        <SettingsOptionGroup
                                            key={control.key}
                                            label={t(
                                                control.label || control.key,
                                            )}
                                            value={value}
                                            options={control.options}
                                            onSelect={(nextValue) =>
                                                updateModelSetting(
                                                    selectedModel,
                                                    control.key,
                                                    nextValue,
                                                )
                                            }
                                        />
                                    );
                                })}
                            </div>
                            {structuredMediaControls.length > 0 && (
                                <div className="media-settings-structured-inputs">
                                    <div className="media-settings-panel-header">
                                        <span>{t("Model Inputs")}</span>
                                    </div>
                                    <div className="media-settings-structured-grid">
                                        {structuredMediaControls.map(
                                            (control) => (
                                                <TextMediaControl
                                                    key={control.key}
                                                    label={t(
                                                        control.label ||
                                                            control.key,
                                                    )}
                                                    value={getSettingValue(
                                                        control.key,
                                                        selectedModelMeta
                                                            ?.mediaDefaults?.[
                                                            control.key
                                                        ] || "",
                                                    )}
                                                    placeholder={
                                                        control.placeholder
                                                            ? t(
                                                                  control.placeholder,
                                                              )
                                                            : ""
                                                    }
                                                    minHeight={52}
                                                    maxHeight={220}
                                                    onChange={(nextValue) =>
                                                        updateModelSetting(
                                                            selectedModel,
                                                            control.key,
                                                            nextValue,
                                                        )
                                                    }
                                                />
                                            ),
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="media-settings-actions">
                    <button className="lb-secondary" onClick={handleCancel}>
                        {t("Cancel")}
                    </button>
                    <button className="lb-primary" onClick={handleSave}>
                        {t("Save Settings")}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

function ImageModal({
    show,
    image,
    onHide,
    audioPlayback,
    mediaPlaybackId,
    onAudioPlaybackChange,
    autoPlayPreview = false,
}) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const [tags, setTags] = useState([]);
    const [newTag, setNewTag] = useState("");
    const [imageZoom, setImageZoom] = useState(1);
    const updateTagsMutation = useUpdateMediaItemTags();
    const tagInputRef = useRef(null);
    const videoRef = useRef(null);
    const modalAudioRef = useRef(null);
    const modalScrollRef = useRef(null);
    const imageZoomContainerRef = useRef(null);
    const ignoreModalPauseRef = useRef(false);
    const inputImageReferences = useMemo(
        () => getInputImageReferences(image),
        [image],
    );

    // Initialize tags when image changes
    useEffect(() => {
        ignoreModalPauseRef.current = false;
        if (image?.tags) {
            setTags(image.tags);
        } else {
            setTags([]);
        }
    }, [image]);

    useEffect(() => {
        if (show) {
            ignoreModalPauseRef.current = false;
        }
    }, [show]);

    useEffect(() => {
        if (
            show &&
            autoPlayPreview &&
            image?.type === "audio" &&
            mediaPlaybackId
        ) {
            onAudioPlaybackChange?.(mediaPlaybackId, {
                activeSurface: "modal",
                currentTime: 0,
                playing: true,
            });
        }
    }, [
        autoPlayPreview,
        image?.type,
        mediaPlaybackId,
        onAudioPlaybackChange,
        show,
    ]);

    const sourceUrl = image?.azureUrl || image?.url || null;
    const displayUrl = sourceUrl ? getDownloadUrl(sourceUrl) : sourceUrl;
    const displayGcsUrl = image?.gcsUrl || null;
    const normalizedStatus = String(image?.status || "").toLowerCase();
    const isProcessingMedia = ["pending", "processing", "queued"].includes(
        normalizedStatus,
    );
    const isFailedMedia = ["failed", "error"].includes(normalizedStatus);
    const mediaErrorMessage =
        typeof image?.error === "string"
            ? image.error
            : image?.error?.message ||
              image?.result?.error?.message ||
              image?.error?.error ||
              "";
    const canRenderMediaPreview = !isProcessingMedia && !isFailedMedia;
    const isZoomableImagePreview =
        canRenderMediaPreview &&
        image?.type !== "video" &&
        image?.type !== "audio" &&
        Boolean(displayUrl);
    const isImageZoomed = imageZoom > 1;

    useEffect(() => {
        if (image?.type === "video" && videoRef.current) {
            videoRef.current.load();
        }
    }, [image?.type, displayUrl]);

    useEffect(() => {
        setImageZoom(1);
    }, [displayUrl, image?.taskId, image?.cortexRequestId, show]);

    const addTag = async () => {
        if (!newTag.trim() || tags.includes(newTag.trim())) return;

        const updatedTags = [...tags, newTag.trim()];
        setTags(updatedTags);
        setNewTag("");

        // Update on server
        await updateTagsOnServer(updatedTags);

        // Restore focus after state update
        setTimeout(() => {
            if (tagInputRef.current) {
                tagInputRef.current.focus();
            }
        }, 0);
    };

    const removeTag = async (tagToRemove) => {
        const updatedTags = tags.filter((tag) => tag !== tagToRemove);
        setTags(updatedTags);

        // Update on server
        await updateTagsOnServer(updatedTags);
    };

    const updateTagsOnServer = async (updatedTags) => {
        if (!image?.taskId) return;

        try {
            await updateTagsMutation.mutateAsync({
                taskId: image.taskId,
                tags: updatedTags,
            });
        } catch (error) {
            console.error("Error updating tags:", error);
            // Revert tags on error
            setTags(image?.tags || []);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            addTag();
        }
    };

    const handleDownload = useCallback(async () => {
        if (!sourceUrl) return;
        const proxyUrl = getDownloadUrl(sourceUrl);
        const name = buildMediaFilename(image);
        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) {
                throw new Error(`Download failed: ${response.status}`);
            }
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = blobUrl;
            link.download = name;
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
        } catch (err) {
            console.error("Download error:", err);
            window.open(proxyUrl, "_blank", "noopener,noreferrer");
        }
    }, [image, sourceUrl]);

    const toggleImageZoom = useCallback(
        (event) => {
            if (!isZoomableImagePreview) return;
            const container =
                imageZoomContainerRef.current || event?.currentTarget || null;
            const clickPoint =
                event?.clientX != null && event?.clientY != null && container
                    ? {
                          x:
                              (event.clientX -
                                  container.getBoundingClientRect().left) /
                              Math.max(container.clientWidth, 1),
                          y:
                              (event.clientY -
                                  container.getBoundingClientRect().top) /
                              Math.max(container.clientHeight, 1),
                      }
                    : null;

            setImageZoom((current) => {
                if (current > 1) return 1;

                window.requestAnimationFrame(() => {
                    if (!container) return;
                    const targetX = clickPoint?.x ?? 0.5;
                    const targetY = clickPoint?.y ?? 0.5;
                    container.scrollLeft =
                        targetX * container.scrollWidth -
                        container.clientWidth / 2;
                    container.scrollTop =
                        targetY * container.scrollHeight -
                        container.clientHeight / 2;
                });

                return 2;
            });
        },
        [isZoomableImagePreview],
    );

    const handleImageZoomKeyDown = useCallback(
        (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            toggleImageZoom();
        },
        [toggleImageZoom],
    );

    const handleHide = useCallback(() => {
        const audio = modalAudioRef.current;
        if (image?.type === "audio" && mediaPlaybackId && audio) {
            ignoreModalPauseRef.current = true;
            onAudioPlaybackChange?.(mediaPlaybackId, {
                activeSurface: "tile",
                currentTime: getAudioTime(audio, "currentTime"),
                duration: getAudioTime(audio, "duration"),
                playing: !audio.paused,
            });
        }
        onHide();
    }, [image?.type, mediaPlaybackId, onAudioPlaybackChange, onHide]);

    const handleDetailsToggle = useCallback((event) => {
        const details = event.currentTarget;
        if (!details.open) return;

        window.requestAnimationFrame(() => {
            const scrollContainer = modalScrollRef.current;
            if (!scrollContainer) {
                details.scrollIntoView({
                    behavior: "smooth",
                    block: "end",
                    inline: "nearest",
                });
                return;
            }

            const containerRect = scrollContainer.getBoundingClientRect();
            const detailsRect = details.getBoundingClientRect();
            const bottomOverflow = detailsRect.bottom - containerRect.bottom;

            if (bottomOverflow > 0) {
                scrollContainer.scrollBy({
                    top: bottomOverflow + 12,
                    behavior: "smooth",
                });
            }
        });
    }, []);

    return (
        <Modal
            show={show}
            onHide={handleHide}
            title={t(`Generated ${image?.type || "image"}`)}
            widthClassName="max-w-[min(96vw,1180px)] max-h-[calc(100vh-1rem)] flex flex-col !p-3 sm:!p-6"
            titleClassName="!mb-2 sm:!mb-4"
        >
            <div
                ref={modalScrollRef}
                className="min-h-0 flex-1 overflow-y-auto bg-transparent p-0 sm:rounded-lg sm:border sm:border-gray-200 sm:bg-gray-50 sm:p-3 sm:dark:border-gray-700 sm:dark:bg-gray-950"
            >
                <div className="overflow-hidden bg-transparent sm:rounded-lg sm:border sm:border-gray-200 sm:bg-gray-100 sm:shadow-sm sm:dark:border-gray-700 sm:dark:bg-gray-950">
                    <div
                        className="group relative flex min-h-[240px] flex-col items-center justify-center bg-transparent p-0 sm:min-h-[460px] sm:bg-gray-100 sm:p-3 sm:dark:bg-gray-950 lg:h-[min(76vh,780px)]"
                        dir={direction}
                    >
                        <div className="flex h-[min(52vh,420px)] min-h-[240px] w-full flex-shrink-0 items-center justify-center overflow-hidden sm:min-h-0 sm:flex-1">
                            {!canRenderMediaPreview ? (
                                <div
                                    className={`flex min-h-[280px] w-full flex-col items-center justify-center gap-4 rounded-md border p-6 text-center sm:min-h-[360px] ${
                                        isFailedMedia
                                            ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-100"
                                            : "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/35 dark:text-sky-100"
                                    }`}
                                >
                                    {isFailedMedia ? (
                                        <AlertCircle className="h-12 w-12" />
                                    ) : (
                                        <Loader2 className="h-12 w-12 animate-spin" />
                                    )}
                                    <div>
                                        <div className="font-semibold">
                                            {isFailedMedia
                                                ? t("Media generation failed")
                                                : t("Processing")}
                                        </div>
                                        {isFailedMedia && (
                                            <div className="mt-2 max-w-xl whitespace-pre-wrap break-words text-sm">
                                                {mediaErrorMessage ||
                                                    t("Unknown error occurred")}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : image?.type === "video" ? (
                                <video
                                    key={
                                        displayUrl ||
                                        image?.cortexRequestId ||
                                        image?.taskId
                                    }
                                    ref={videoRef}
                                    className="h-full w-full rounded-lg bg-black object-contain sm:rounded-none"
                                    src={displayUrl}
                                    controls
                                    preload="metadata"
                                    autoPlay={autoPlayPreview}
                                    playsInline={autoPlayPreview}
                                />
                            ) : image?.type === "audio" ? (
                                <div className="flex h-full w-full max-w-3xl flex-col justify-between rounded-lg border border-gray-200 bg-white p-6 text-gray-900 shadow-2xl dark:border-white/10 dark:bg-gray-900 dark:text-white sm:p-8">
                                    <div className="flex flex-1 flex-col items-center justify-center gap-5">
                                        <Music className="h-12 w-12 text-sky-500 dark:text-cyan-200" />
                                        <div
                                            className="audio-bars w-full max-w-sm"
                                            aria-hidden="true"
                                        >
                                            {Array.from({ length: 28 }).map(
                                                (_, i) => (
                                                    <span
                                                        key={i}
                                                        style={{
                                                            height: `${16 + ((i * 11) % 48)}%`,
                                                        }}
                                                    />
                                                ),
                                            )}
                                        </div>
                                    </div>
                                    <SyncedAudioControl
                                        key={
                                            sourceUrl ||
                                            image?.cortexRequestId ||
                                            image?.taskId
                                        }
                                        className="w-full"
                                        mediaId={mediaPlaybackId}
                                        src={displayUrl}
                                        surface="modal"
                                        playback={audioPlayback}
                                        onPlaybackChange={onAudioPlaybackChange}
                                        audioRef={modalAudioRef}
                                        ignorePauseRef={ignoreModalPauseRef}
                                        ariaLabel={t("Play generated audio")}
                                    />
                                </div>
                            ) : (
                                <div
                                    ref={imageZoomContainerRef}
                                    className={`h-full w-full ${
                                        isImageZoomed
                                            ? "overflow-auto cursor-zoom-out touch-pan-x touch-pan-y"
                                            : "flex items-center justify-center overflow-hidden cursor-zoom-in touch-manipulation"
                                    }`}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={
                                        isImageZoomed
                                            ? t("Zoom out image")
                                            : t("Zoom in image")
                                    }
                                    title={
                                        isImageZoomed
                                            ? t("Zoom out image")
                                            : t("Zoom in image")
                                    }
                                    onClick={toggleImageZoom}
                                    onKeyDown={handleImageZoomKeyDown}
                                >
                                    <div
                                        className={
                                            isImageZoomed
                                                ? "flex items-start justify-center"
                                                : "flex items-center justify-center"
                                        }
                                        style={{
                                            width: `${imageZoom * 100}%`,
                                            height: `${imageZoom * 100}%`,
                                        }}
                                    >
                                        <ImageWithFallback
                                            className={
                                                isImageZoomed
                                                    ? "h-full w-full object-contain object-top"
                                                    : "max-h-full max-w-full object-contain"
                                            }
                                            src={displayUrl}
                                            alt={image?.prompt}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {isZoomableImagePreview && (
                            <button
                                className="absolute end-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200/80 bg-white/80 text-gray-900 shadow-lg backdrop-blur-md transition-colors hover:bg-white/95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 sm:pointer-events-none sm:opacity-0 sm:transition-opacity sm:duration-75 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-focus-within:duration-150 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-hover:duration-150 dark:border-white/15 dark:bg-black/45 dark:text-white dark:hover:bg-black/65 dark:focus-visible:outline-sky-300"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    toggleImageZoom();
                                }}
                                title={
                                    isImageZoomed
                                        ? t("Zoom out image")
                                        : t("Zoom in image")
                                }
                                aria-label={
                                    isImageZoomed
                                        ? t("Zoom out image")
                                        : t("Zoom in image")
                                }
                            >
                                {isImageZoomed ? (
                                    <ZoomOut className="h-4 w-4" />
                                ) : (
                                    <ZoomIn className="h-4 w-4" />
                                )}
                            </button>
                        )}

                        <button
                            className="absolute start-2 top-2 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200/80 bg-white/80 text-gray-900 shadow-lg backdrop-blur-md transition-colors hover:bg-white/95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-40 sm:pointer-events-none sm:start-3 sm:top-3 sm:h-10 sm:w-10 sm:opacity-0 sm:transition-opacity sm:duration-75 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-focus-within:duration-150 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-hover:duration-150 dark:border-white/15 dark:bg-black/45 dark:text-white dark:hover:bg-black/65 dark:focus-visible:outline-sky-300"
                            onClick={handleDownload}
                            disabled={!sourceUrl}
                            title={t("Download")}
                            aria-label={t("Download")}
                        >
                            <Download className="h-4 w-4" />
                        </button>

                        <MediaMetadataPills
                            data={{
                                ...image,
                                azureUrl: image?.azureUrl || null,
                                gcsUrl: displayGcsUrl,
                                originalUrl: image?.url || null,
                            }}
                            type={image?.type || "image"}
                            audioPlayback={audioPlayback}
                        />
                    </div>
                </div>

                {inputImageReferences.length > 0 && (
                    <details className="mt-2 rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 sm:rounded-lg">
                        <summary className="cursor-pointer px-2.5 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 marker:text-gray-400 dark:text-gray-400 sm:px-3">
                            {t("Input Images")}
                        </summary>
                        <div className="border-t border-gray-200 p-3 dark:border-gray-700">
                            <div className="media-modal-input-grid">
                                {inputImageReferences.map((reference) =>
                                    reference.displayUrl ? (
                                        <a
                                            key={reference.id}
                                            href={reference.displayUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="media-modal-input-thumb"
                                            title={reference.url}
                                        >
                                            <ImageWithFallback
                                                src={reference.displayUrl}
                                                alt={t("Input image")}
                                            />
                                            {reference.role && (
                                                <ReferenceImageRoleBadge
                                                    role={reference.role}
                                                    label={getReferenceImageRoleLabel(
                                                        reference.role,
                                                        t,
                                                    )}
                                                    className="media-modal-input-role"
                                                />
                                            )}
                                        </a>
                                    ) : (
                                        <div
                                            key={reference.id}
                                            className="media-modal-input-reference"
                                            title={reference.url}
                                        >
                                            <span>{t("Input image")}</span>
                                            <span>
                                                {reference.role
                                                    ? getReferenceImageRoleLabel(
                                                          reference.role,
                                                          t,
                                                      )
                                                    : t("GCS reference")}
                                            </span>
                                        </div>
                                    ),
                                )}
                            </div>
                        </div>
                    </details>
                )}

                <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
                    <details
                        className="rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 sm:rounded-lg"
                        onToggle={handleDetailsToggle}
                    >
                        <summary className="cursor-pointer px-2.5 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 marker:text-gray-400 dark:text-gray-400 sm:px-3">
                            {t("Prompt")}
                        </summary>
                        <div className="border-t border-gray-200 p-2 dark:border-gray-700 sm:p-3">
                            <textarea
                                className="min-h-36 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-3 text-base text-gray-800 shadow-inner focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 md:text-sm"
                                value={image?.prompt}
                                readOnly
                                rows={6}
                            />
                        </div>
                    </details>

                    <details
                        className="rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 sm:rounded-lg"
                        onToggle={handleDetailsToggle}
                    >
                        <summary className="cursor-pointer px-2.5 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 marker:text-gray-400 dark:text-gray-400 sm:px-3">
                            {t("Tags")}
                        </summary>
                        <div className="border-t border-gray-200 p-2 dark:border-gray-700 sm:p-3">
                            <div className="mb-3 flex min-h-8 flex-wrap gap-1.5">
                                {tags.map((tag, index) => (
                                    <span
                                        key={index}
                                        className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/50 dark:text-sky-200"
                                    >
                                        #{tag}
                                        <button
                                            className="ms-1 rounded-full hover:text-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:hover:text-sky-300"
                                            onClick={() => removeTag(tag)}
                                            disabled={
                                                updateTagsMutation.isPending
                                            }
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    className="min-h-10 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 md:text-sm"
                                    placeholder={t("Add tag...")}
                                    value={newTag}
                                    onChange={(e) => setNewTag(e.target.value)}
                                    onKeyPress={handleKeyPress}
                                    disabled={updateTagsMutation.isPending}
                                    ref={tagInputRef}
                                />
                                <button
                                    className="lb-primary min-h-10 w-16 justify-center disabled:cursor-not-allowed disabled:opacity-50"
                                    onClick={addTag}
                                    disabled={
                                        !newTag.trim() ||
                                        updateTagsMutation.isPending
                                    }
                                >
                                    {updateTagsMutation.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        t("Add")
                                    )}
                                </button>
                            </div>
                        </div>
                    </details>
                </div>
            </div>
        </Modal>
    );
}

function MediaMetadataPills({ data, type, audioPlayback }) {
    const { t } = useTranslation();
    const { data: mediaModels } = useMediaModels();
    const [copiedKey, setCopiedKey] = useState(null);
    const loadedAudioDuration = Number.isFinite(audioPlayback?.duration)
        ? Math.round(audioPlayback.duration)
        : null;
    const persistedAudioDuration = Number.isFinite(data?.duration)
        ? Math.round(data.duration)
        : null;
    const displayDuration = loadedAudioDuration ?? persistedAudioDuration;

    const getModelDisplayName = (modelName) => {
        const apiModel = mediaModels?.find((m) => m.modelId === modelName);
        return t(apiModel?.displayName || modelName);
    };

    const formatDuration = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const remainder = seconds % 60;
        return `${minutes}:${String(remainder).padStart(2, "0")}`;
    };

    const copyToClipboard = async (key, value) => {
        if (!value) return;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
            } else {
                const textarea = document.createElement("textarea");
                textarea.value = value;
                textarea.setAttribute("readonly", "");
                textarea.style.position = "fixed";
                textarea.style.opacity = "0";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);
            }
            setCopiedKey(key);
            window.setTimeout(() => {
                setCopiedKey((currentKey) =>
                    currentKey === key ? null : currentKey,
                );
            }, 1400);
        } catch (error) {
            console.error("Failed to copy media link:", error);
        }
    };

    const createdLabel = data?.created
        ? new Date(data.created * 1000).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
          })
        : null;

    const metaPills = [
        createdLabel && {
            key: "created",
            label: createdLabel,
            title: t("Created"),
        },
        data?.model && {
            key: "model",
            label: getModelDisplayName(data.model),
            title: t("Model"),
        },
        type === "audio" &&
            displayDuration && {
                key: "duration",
                label: formatDuration(displayDuration),
                title: t("Duration"),
            },
    ].filter(Boolean);

    const actionPills = [
        data?.prompt && {
            key: "prompt",
            label: t("Copy Prompt"),
            title: t("Prompt"),
            value: data.prompt,
        },
        data?.azureUrl && {
            key: "azure",
            label: t("Azure Link"),
            title: t("Azure URL"),
            value: data.azureUrl,
        },
        data?.gcsUrl && {
            key: "gcs",
            label: t("GCS Link"),
            title: t("GCS URL"),
            value: data.gcsUrl,
        },
        (data?.originalUrl || data?.url) &&
            data?.originalUrl !== data?.azureUrl && {
                key: "original",
                label: t("Source Link"),
                title: t("Original URL"),
                value: data.originalUrl || data.url,
            },
    ].filter(Boolean);
    const pills = [...metaPills, ...actionPills];

    if (!pills.length) {
        return null;
    }

    return (
        <>
            <div className="mt-2 grid w-full gap-2 sm:hidden">
                {metaPills.length > 0 && (
                    <div className="truncate text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                        {metaPills.map((pill) => pill.label).join(" · ")}
                    </div>
                )}
                {actionPills.length > 0 && (
                    <div className="grid grid-cols-2 gap-1.5">
                        {actionPills.map((pill) => {
                            const isCopied = copiedKey === pill.key;

                            return (
                                <button
                                    key={pill.key}
                                    type="button"
                                    className="inline-flex min-h-9 min-w-0 items-center justify-center rounded-md border border-gray-200 bg-white px-2 text-center text-xs font-semibold text-gray-700 transition-colors hover:border-sky-300 hover:text-sky-700 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-sky-500 dark:hover:text-sky-200"
                                    onClick={() =>
                                        copyToClipboard(pill.key, pill.value)
                                    }
                                    title={`${t("Copy")} ${pill.title}`}
                                    aria-label={`${t("Copy")} ${pill.title}`}
                                >
                                    <span className="truncate">
                                        {isCopied
                                            ? t("Copied to clipboard")
                                            : pill.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
            <div className="z-20 mt-2 hidden w-full max-w-full flex-col items-stretch gap-1 sm:pointer-events-none sm:absolute sm:end-3 sm:top-3 sm:mt-0 sm:flex sm:w-auto sm:max-w-[14rem] sm:opacity-0 sm:transition-opacity sm:duration-75 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-focus-within:duration-150 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-hover:duration-150 md:max-w-xs md:gap-1.5">
                {pills.map((pill) => {
                    const isCopied = copiedKey === pill.key;
                    const className =
                        "inline-flex min-h-8 min-w-0 max-w-full items-center justify-center rounded-full border border-gray-200/80 bg-white/80 px-2.5 py-1 text-center text-[11px] font-medium text-gray-900 shadow-lg backdrop-blur-md transition-colors dark:border-white/15 dark:bg-black/45 dark:text-white sm:min-h-9 sm:px-3 sm:py-1.5 sm:text-xs md:min-w-40 lg:min-w-48";

                    if (pill.value) {
                        return (
                            <button
                                key={pill.key}
                                type="button"
                                className={`${className} cursor-pointer hover:border-sky-300 hover:bg-white/95 hover:text-sky-700 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:hover:border-sky-300/70 dark:hover:bg-black/65 dark:hover:text-sky-100 dark:focus-visible:outline-sky-300`}
                                onClick={() =>
                                    copyToClipboard(pill.key, pill.value)
                                }
                                title={`${t("Copy")} ${pill.title}`}
                                aria-label={`${t("Copy")} ${pill.title}`}
                            >
                                <span className="truncate">
                                    {isCopied
                                        ? t("Copied to clipboard")
                                        : pill.label}
                                </span>
                            </button>
                        );
                    }

                    return (
                        <span
                            key={pill.key}
                            className={className}
                            title={pill.title}
                        >
                            <span className="truncate">{pill.label}</span>
                        </span>
                    );
                })}
            </div>
        </>
    );
}

export default MediaPage;
