import { SYS_MODEL_METADATA } from "../../../src/graphql";
import {
    getReasoningEffortLevelsForModel,
    REASONING_EFFORT_LEVELS,
} from "../../../src/utils/reasoningEffortI18n.js";
import { buildMediaModelControls } from "../../../src/utils/mediaModelControls.js";
import config from "../../../app.config/config/index.js";

function parseMetadataResult(result) {
    if (!result) return {};
    if (typeof result === "string") return JSON.parse(result);
    return result;
}

function getModelId(model) {
    return model?.modelId || model?.id;
}

function toSdkModel(model, defaultModelId) {
    const id = getModelId(model);
    const reasoningEfforts = getReasoningEffortLevelsForModel(model);

    return {
        id,
        modelId: id,
        name: model.displayName || model.name || id,
        provider: model.provider || null,
        category: model.category || "chat",
        isDefault: id === defaultModelId,
        isModelGroup: Boolean(model.isModelGroup),
        supportsReasoningEffort: reasoningEfforts.length > 0,
        reasoningEfforts,
    };
}

function toSdkMediaModel(model, defaultModelId) {
    const id = getModelId(model);
    const controls = buildMediaModelControls(model);

    return {
        id,
        modelId: id,
        name: model.displayName || model.name || id,
        provider: model.provider || null,
        category: model.category,
        isDefault: id === defaultModelId,
        mediaDefaults: model.mediaDefaults || {},
        mediaControls: controls,
        availableOutputFormats: model.availableOutputFormats || [],
        availableAspectRatios: model.availableAspectRatios || [],
        availableImageSizes: model.availableImageSizes || [],
        availableResolutions: model.availableResolutions || [],
        availableDurations: model.availableDurations || [],
        mediaDefaultOverrides: model.mediaDefaultOverrides || [],
        mediaToggles: model.mediaToggles || [],
        referenceImageRoles: model.referenceImageRoles || [],
        referencePurposes: model.referencePurposes || {},
        mediaReferencePurposes: model.mediaReferencePurposes || {},
        referenceDescriptions: model.referenceDescriptions || {},
        mediaReferenceDescriptions: model.mediaReferenceDescriptions || {},
        videoInputModes: model.videoInputModes || [],
        mediaInputModes: model.mediaInputModes || [],
        preferredUrlFormat: model.preferredUrlFormat || null,
    };
}

export function normalizeAppletModelMetadata(
    metadata,
    defaultModelId = config.cortex.defaultChatModel,
) {
    const rawModels = Array.isArray(metadata?.models) ? metadata.models : [];
    const allowedModels = rawModels.filter(
        (model) =>
            getModelId(model) &&
            model.category === "chat" &&
            model.isAvailable !== false,
    );
    const resolvedDefaultModelId =
        getModelId(
            allowedModels.find((model) => getModelId(model) === defaultModelId),
        ) ||
        getModelId(allowedModels.find((model) => model.isDefault)) ||
        getModelId(allowedModels[0]) ||
        defaultModelId;

    const models = allowedModels.map((model) =>
        toSdkModel(model, resolvedDefaultModelId),
    );

    if (
        resolvedDefaultModelId &&
        !models.some((model) => model.id === resolvedDefaultModelId)
    ) {
        models.unshift({
            id: resolvedDefaultModelId,
            modelId: resolvedDefaultModelId,
            name: resolvedDefaultModelId,
            provider: null,
            category: "chat",
            isDefault: true,
            isModelGroup: false,
            supportsReasoningEffort: true,
            reasoningEfforts: REASONING_EFFORT_LEVELS,
        });
    }

    return {
        models,
        defaultModel: resolvedDefaultModelId,
        reasoningEfforts: REASONING_EFFORT_LEVELS,
    };
}

export function normalizeAppletMediaModelMetadata(metadata) {
    const rawModels = Array.isArray(metadata?.models) ? metadata.models : [];
    const allowedModels = rawModels.filter(
        (model) =>
            getModelId(model) &&
            model.isAvailable !== false &&
            ["image", "video", "audio", "tts", "upscaling"].includes(
                model.category,
            ),
    );
    const resolvedDefaultModelId =
        getModelId(allowedModels.find((model) => model.isDefault)) ||
        getModelId(allowedModels.find((model) => model.category === "image")) ||
        getModelId(allowedModels[0]) ||
        null;

    return {
        models: allowedModels.map((model) =>
            toSdkMediaModel(model, resolvedDefaultModelId),
        ),
        defaultModel: resolvedDefaultModelId,
    };
}

export async function fetchAppletModelMetadata(graphqlClient) {
    const response = await graphqlClient.query({
        query: SYS_MODEL_METADATA,
        variables: { category: "chat" },
        fetchPolicy: "network-only",
    });
    const metadata = parseMetadataResult(
        response.data?.sys_model_metadata?.result,
    );

    return normalizeAppletModelMetadata(metadata);
}

export async function fetchAppletMediaModelMetadata(graphqlClient) {
    const response = await graphqlClient.query({
        query: SYS_MODEL_METADATA,
        fetchPolicy: "network-only",
    });
    const metadata = parseMetadataResult(
        response.data?.sys_model_metadata?.result,
    );

    return normalizeAppletMediaModelMetadata(metadata);
}

export function findAllowedModel(metadata, modelId) {
    if (!modelId) return null;
    return metadata.models.find((model) => model.id === modelId) || null;
}

export function isValidReasoningEffort(reasoningEffort) {
    return REASONING_EFFORT_LEVELS.includes(reasoningEffort);
}
