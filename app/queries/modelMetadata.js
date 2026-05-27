import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApolloClient } from "@apollo/client";
import { SYS_MODEL_METADATA } from "../../src/graphql";

/**
 * Fetch all model metadata from cortex.
 * Returns { models: [...], redirects: {...} }
 */
export function useModelMetadata() {
    const client = useApolloClient();

    return useQuery({
        queryKey: ["modelMetadata"],
        queryFn: async () => {
            const { data } = await client.query({
                query: SYS_MODEL_METADATA,
                fetchPolicy: "network-only",
            });
            return JSON.parse(data.sys_model_metadata.result);
        },
        staleTime: 30 * 1000,
        refetchOnMount: "always",
    });
}

/**
 * Models with isAgentic: true — for the agent model picker.
 */
export function useAgentModels() {
    const { data, ...rest } = useModelMetadata();
    const agentModels = useMemo(
        () =>
            (data?.models?.filter((m) => m.isAgentic) || []).sort((a, b) => {
                if (Boolean(a.isModelGroup) !== Boolean(b.isModelGroup)) {
                    return a.isModelGroup ? -1 : 1;
                }

                const aName = a.displayName || a.modelId || "";
                const bName = b.displayName || b.modelId || "";
                const byName = aName.localeCompare(bName, undefined, {
                    sensitivity: "base",
                });

                if (byName !== 0) return byName;

                return (a.modelId || "").localeCompare(b.modelId || "");
            }),
        [data],
    );
    const redirects = data?.redirects || {};
    return { data: agentModels, redirects, ...rest };
}

/**
 * Chat models — for the workspace LLM selector.
 */
export function useChatModels() {
    const { data, ...rest } = useModelMetadata();
    const chatModels = useMemo(
        () => data?.models?.filter((m) => m.category === "chat") || [],
        [data],
    );
    const redirects = data?.redirects || {};
    return { data: chatModels, redirects, ...rest };
}

/**
 * Image, video, music, and speech models — for the media page.
 */
export function useMediaModels() {
    const { data, ...rest } = useModelMetadata();
    const mediaModels = useMemo(
        () =>
            data?.models?.filter(
                (m) =>
                    m.isAvailable !== false &&
                    (m.category === "image" ||
                        m.category === "video" ||
                        m.category === "audio" ||
                        m.category === "tts"),
            ) || [],
        [data],
    );
    return { data: mediaModels, ...rest };
}

/**
 * Resolve a stored model ID to a valid one: returns the original if it still
 * exists, follows a redirect if one is defined, or falls back to the default.
 * Works for any model category (agent, chat, etc.).
 */
export function resolveModelId(modelId, models, redirects) {
    if (!models || models.length === 0) return modelId;

    // Check if model exists directly
    if (modelId && models.some((m) => m.modelId === modelId)) {
        return modelId;
    }

    // Check redirects
    const redirected = redirects?.[modelId];
    if (redirected && models.some((m) => m.modelId === redirected)) {
        return redirected;
    }

    // Return default agent model
    const defaultModel = models.find((m) => m.isDefault);
    return defaultModel?.modelId || models[0]?.modelId || modelId;
}

function normalizeText(value) {
    return String(value || "").toLowerCase();
}

function getModelSearchText(modelOrId) {
    if (!modelOrId) return "";
    if (typeof modelOrId === "string") return normalizeText(modelOrId);
    return normalizeText(
        [
            modelOrId.modelId,
            modelOrId.displayName,
            modelOrId.name,
            modelOrId.provider,
        ].join(" "),
    );
}

function inferProvider(modelOrId) {
    const text = getModelSearchText(modelOrId);
    const explicitProvider =
        typeof modelOrId === "object" ? normalizeText(modelOrId.provider) : "";

    if (explicitProvider && explicitProvider !== "cortex") {
        return explicitProvider;
    }
    if (text.includes("claude") || text.includes("anthropic")) {
        return "anthropic";
    }
    if (text.includes("gemini") || text.includes("google")) {
        return "google";
    }
    if (text.includes("grok") || text.includes("xai")) {
        return "xai";
    }
    if (text.includes("kimi") || text.includes("moonshot")) {
        return "moonshot";
    }
    if (text.includes("llama") || text.includes("meta")) {
        return "meta";
    }
    if (
        text.includes("gpt") ||
        text.includes("openai") ||
        /^o\d/.test(text) ||
        text.includes("oai-")
    ) {
        return "openai";
    }

    return explicitProvider || null;
}

function inferModelFamily(modelOrId) {
    const text = getModelSearchText(modelOrId);
    const families = [
        "opus",
        "sonnet",
        "haiku",
        "gpt",
        "gemini",
        "grok",
        "kimi",
        "llama",
        "mistral",
        "deepseek",
    ];

    return families.find((family) => text.includes(family)) || null;
}

function versionParts(model) {
    const text = getModelSearchText(model);
    return (text.match(/\d+/g) || []).map((part) => Number(part));
}

function compareVersionParts(a, b) {
    const left = versionParts(a);
    const right = versionParts(b);
    const length = Math.max(left.length, right.length);

    for (let index = 0; index < length; index += 1) {
        const diff = (left[index] || 0) - (right[index] || 0);
        if (diff !== 0) return diff;
    }

    return getModelSearchText(a).localeCompare(getModelSearchText(b));
}

/**
 * Resolve the chat send model against the current agent model picker options.
 *
 * Stale saved models should not be sent back to Cortex. Prefer exact matches,
 * then Cortex-provided redirects, then the newest accepted model from the same
 * provider and family, and finally the system default.
 */
export function resolveAgentModelForSend(
    modelId,
    agentModels,
    redirects,
    fallbackModelId,
) {
    if (!agentModels || agentModels.length === 0) {
        return fallbackModelId || modelId;
    }

    if (modelId && agentModels.some((model) => model.modelId === modelId)) {
        return modelId;
    }

    const redirected = redirects?.[modelId];
    if (
        redirected &&
        agentModels.some((model) => model.modelId === redirected)
    ) {
        return redirected;
    }

    const provider = inferProvider(modelId);
    const family = inferModelFamily(modelId);

    if (provider && family) {
        const sameFamilyModels = agentModels
            .filter((model) => !model.isModelGroup)
            .filter(
                (model) =>
                    inferProvider(model) === provider &&
                    inferModelFamily(model) === family,
            )
            .sort(compareVersionParts);

        const latestSameFamily =
            sameFamilyModels[sameFamilyModels.length - 1]?.modelId;
        if (latestSameFamily) {
            return latestSameFamily;
        }
    }

    const defaultModel = fallbackModelId
        ? agentModels.find((model) => model.modelId === fallbackModelId)
        : agentModels.find((model) => model.isDefault);

    return (
        defaultModel?.modelId ||
        agentModels.find((model) => model.isDefault)?.modelId ||
        fallbackModelId ||
        agentModels[0]?.modelId ||
        modelId
    );
}

/**
 * Look up display name for a model ID.
 */
export function getDisplayNameFromModelId(modelId, models) {
    const model = models?.find((m) => m.modelId === modelId);
    return model?.displayName || modelId;
}

/**
 * Look up provider for a model ID.
 */
export function getProviderFromModelId(modelId, models) {
    const model = models?.find((m) => m.modelId === modelId);
    return model?.provider || inferProvider(modelId) || "openai";
}
