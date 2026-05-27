import { SYS_MODEL_METADATA } from "../../../src/graphql";
import {
    getReasoningEffortLevelsForModel,
    REASONING_EFFORT_LEVELS,
} from "../../../src/utils/reasoningEffortI18n.js";
import config from "../../../app.config/config/index.js";

function parseMetadataResult(result) {
    if (!result) return {};
    if (typeof result === "string") return JSON.parse(result);
    return result;
}

function toSdkModel(model, defaultModelId) {
    const id = model.modelId || model.id;
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

export function normalizeAppletModelMetadata(
    metadata,
    defaultModelId = config.cortex.defaultChatModel,
) {
    const rawModels = Array.isArray(metadata?.models) ? metadata.models : [];
    const allowedModels = rawModels.filter(
        (model) =>
            (model.modelId || model.id) &&
            model.category === "chat" &&
            model.isAvailable !== false,
    );
    const resolvedDefaultModelId =
        allowedModels.find((model) => model.modelId === defaultModelId)
            ?.modelId ||
        allowedModels.find((model) => model.isDefault)?.modelId ||
        allowedModels[0]?.modelId ||
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

export function findAllowedModel(metadata, modelId) {
    if (!modelId) return null;
    return metadata.models.find((model) => model.id === modelId) || null;
}

export function isValidReasoningEffort(reasoningEffort) {
    return REASONING_EFFORT_LEVELS.includes(reasoningEffort);
}
